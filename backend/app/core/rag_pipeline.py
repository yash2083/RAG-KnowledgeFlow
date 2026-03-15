import json
import re
from typing import AsyncGenerator, Any
from groq import AsyncGroq
from sentence_transformers import SentenceTransformer
import structlog

from app.config import settings
from app.core.vector_store import get_vector_store
from app.core.graph_store import get_graph_store

log = structlog.get_logger()

SYSTEM_PROMPT = """You are KnowledgeFlow, an adaptive AI tutor. Your role is to explain concepts clearly, build on what the learner already knows, and scaffold toward deeper understanding.

Guidelines:
- Lead with a clear, concrete explanation before elaborating
- Use analogies grounded in everyday experience
- Surface and address common misconceptions proactively
- Adjust vocabulary to the specified difficulty level (1=foundational, 5=expert)
- When introducing a concept for the first time, define it explicitly
- Cite your sources when referencing specific content
- At the end of substantive explanations, suggest 1-2 follow-up concepts to explore
- Format responses in clean Markdown with headers only when the response is long

Difficulty calibration:
- Level 1-2: Simple vocabulary, no jargon, heavy use of analogies
- Level 3: Standard terminology with brief definitions
- Level 4-5: Technical precision, assume domain familiarity

Always be encouraging and intellectually engaging."""


class RAGPipeline:
    """Hybrid RAG pipeline: vector similarity + knowledge graph traversal."""

    def __init__(self):
        self.client = AsyncGroq(api_key=settings.groq_api_key)
        # Load local embedding model once at startup
        self._embedder = SentenceTransformer(settings.embedding_model)
        self.vector_store = get_vector_store()
        self.graph_store = get_graph_store()

    async def embed(self, text: str) -> list[float]:
        # sentence-transformers runs locally – no API call needed
        vector = self._embedder.encode(text, normalize_embeddings=True)
        return vector.tolist()

    async def retrieve(
        self,
        query: str,
        user_id: str | None = None,
        difficulty_max: int | None = None,
        concept_filter: str | None = None,
    ) -> tuple[list[dict], list[str]]:
        """
        Hybrid retrieval: vector search + graph traversal.
        Returns (chunks, highlighted_concept_ids).
        """
        # 1. Embed query
        query_vector = await self.embed(query)

        # 2. Vector search
        vector_results = await self.vector_store.search(
            query_vector=query_vector,
            top_k=settings.top_k_vector,
            max_difficulty=difficulty_max,
        )

        # 3. Extract concept IDs from top vector results
        seed_concept_ids: list[str] = []
        for r in vector_results[:3]:
            seed_concept_ids.extend(r.get("concept_ids", []))
        seed_concept_ids = list(set(seed_concept_ids))

        # 4. Graph traversal: find related concepts
        graph_chunk_ids: list[str] = []
        highlighted_concepts: list[str] = seed_concept_ids.copy()

        if seed_concept_ids:
            related_ids = await self.graph_store.get_related_concept_ids(
                seed_concept_ids, limit=settings.top_k_graph
            )
            highlighted_concepts.extend(related_ids)
            graph_chunk_ids = await self.graph_store.get_chunks_for_concepts(
                related_ids, limit=4
            )

        # 5. Re-rank: merge vector and graph results, prioritize by score
        seen_ids = {r["chunk_id"] for r in vector_results}
        all_chunks = list(vector_results)

        for cid in graph_chunk_ids:
            if cid not in seen_ids:
                # Graph-retrieved chunks get a synthetic score
                all_chunks.append({"chunk_id": cid, "score": 0.6, "_from_graph": True})
                seen_ids.add(cid)

        # Sort by score descending
        all_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        top_chunks = all_chunks[: settings.top_k_vector]

        log.info(
            "rag.retrieve",
            vector_count=len(vector_results),
            graph_count=len(graph_chunk_ids),
            total=len(top_chunks),
            concepts=len(highlighted_concepts),
        )
        return top_chunks, list(set(highlighted_concepts))

    def _build_context(self, chunks: list[dict], max_tokens: int = 6000) -> str:
        """Assemble retrieved chunks into a context block."""
        parts = []
        token_count = 0
        for i, chunk in enumerate(chunks):
            text = chunk.get("text", "")
            if not text:
                continue
            tokens = len(text) // 4  # rough estimate
            if token_count + tokens > max_tokens:
                break
            source = chunk.get("source_doc_id", "unknown")
            parts.append(f"[Source {i+1}: {source}]\n{text}")
            token_count += tokens

        return "\n\n---\n\n".join(parts)

    async def generate_stream(
        self,
        query: str,
        history: list[dict],
        chunks: list[dict],
        difficulty: int = 3,
        user_name: str = "learner",
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from LLM."""
        context = self._build_context(chunks)
        difficulty_label = {1: "foundational", 2: "beginner", 3: "intermediate",
                            4: "advanced", 5: "expert"}[difficulty]

        user_message = (
            f"[Difficulty: {difficulty_label}]\n\n"
            f"Context from knowledge base:\n{context}\n\n"
            f"---\n\nQuestion: {query}"
        )

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history[-6:])  # Keep last 3 exchanges
        messages.append({"role": "user", "content": user_message})

        stream = await self.client.chat.completions.create(
            model=settings.groq_model,
            messages=messages,
            stream=True,
            temperature=0.7,
            max_tokens=2048,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def extract_concepts_from_text(self, text: str) -> list[dict]:
        """
        Use LLM to extract concept nodes and relationships from raw text.
        Returns list of {name, description, difficulty, domain, prerequisites}.
        """
        response = await self.client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a knowledge graph builder. Extract educational concepts "
                        "from the given text. Return ONLY valid JSON, no markdown."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Extract concepts from this text. Return JSON array where each item has: "
                        f"name (string), description (1-2 sentences), difficulty (1-5 int), "
                        f"domain (string), prerequisites (list of concept names from your list).\n\n{text[:3000]}"
                    ),
                },
            ],
            temperature=0.2,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        try:
            parsed = json.loads(raw)
            return parsed.get("concepts", [])
        except json.JSONDecodeError:
            log.warning("rag.concept_extraction_failed", raw=raw[:200])
            return []

    async def generate_quiz_question(
        self, concept_name: str, concept_description: str, difficulty: int
    ) -> dict:
        """Generate a multiple-choice quiz question for a concept."""
        response = await self.client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a quiz generator. Return ONLY valid JSON.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Generate a multiple-choice question for the concept '{concept_name}': "
                        f"{concept_description}\n\n"
                        f"Difficulty level: {difficulty}/5\n\n"
                        f"Return JSON with: question (string), options (list of 4 strings), "
                        f"correct_index (0-3), explanation (string explaining the answer)."
                    ),
                },
            ],
            temperature=0.7,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}


# Singleton
_pipeline: RAGPipeline | None = None


def get_rag_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
    return _pipeline
