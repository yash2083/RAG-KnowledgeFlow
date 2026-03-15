import uuid
import asyncio
import re
from pathlib import Path
from typing import Any
import structlog

from app.config import settings
from app.core.rag_pipeline import get_rag_pipeline
from app.core.vector_store import get_vector_store
from app.core.graph_store import get_graph_store

log = structlog.get_logger()


def semantic_chunk(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """
    Chunk text by sentence boundaries, targeting chunk_size tokens.
    Falls back to paragraph splitting for large documents.
    """
    # Split on sentence boundaries first
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks = []
    current = []
    current_len = 0

    for sentence in sentences:
        words = sentence.split()
        slen = len(words)
        if current_len + slen > chunk_size and current:
            chunks.append(" ".join(current))
            # Overlap: keep last N words
            overlap_words = current[-overlap:] if len(current) > overlap else current
            current = overlap_words + words
            current_len = len(current)
        else:
            current.extend(words)
            current_len += slen

    if current:
        chunks.append(" ".join(current))

    return [c.strip() for c in chunks if c.strip()]


def extract_text_from_file(file_path: str, content_type: str) -> str:
    """Extract plain text from a file based on its type."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if content_type == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            return "\n\n".join(
                page.extract_text() for page in reader.pages if page.extract_text()
            )
        except Exception as e:
            raise RuntimeError(f"PDF extraction failed: {e}")

    elif content_type in ("markdown", "text"):
        return path.read_text(encoding="utf-8")

    elif content_type == "docx":
        try:
            from docx import Document
            doc = Document(str(path))
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            raise RuntimeError(f"DOCX extraction failed: {e}")

    else:
        # Try reading as plain text
        try:
            return path.read_text(encoding="utf-8")
        except Exception:
            raise ValueError(f"Unsupported content type: {content_type}")


class IngestionService:
    """
    End-to-end ingestion pipeline:
    1. Extract text from document
    2. Semantic chunking
    3. Embed chunks → Qdrant
    4. Extract concepts → Neo4j
    5. Link chunks to concepts
    """

    def __init__(self):
        self.pipeline = get_rag_pipeline()
        self.vector_store = get_vector_store()
        self.graph_store = get_graph_store()

    async def ingest_text(
        self,
        text: str,
        document_name: str,
        source_doc_id: str,
        content_type: str = "text",
        domain: str = "general",
        difficulty: int = 3,
        ingestion_job_id: str = "",
    ) -> dict:
        """
        Ingest raw text. Returns stats dict with chunks/nodes/edges counts.
        """
        log.info("ingestion.start", doc=document_name, chars=len(text))

        # ── Step 1: Chunk ──────────────────────────────────────────────────
        raw_chunks = semantic_chunk(text, settings.chunk_size, settings.chunk_overlap)
        log.info("ingestion.chunked", count=len(raw_chunks))

        # ── Step 2: Extract concepts (run on first 3000 chars for efficiency) ──
        sample = text[:3000]
        concepts_raw = await self.pipeline.extract_concepts_from_text(sample)
        log.info("ingestion.concepts_extracted", count=len(concepts_raw))

        # ── Step 3: Create concept nodes in Neo4j ──────────────────────────
        concept_name_to_id: dict[str, str] = {}
        nodes_created = 0
        for c in concepts_raw:
            cid = str(uuid.uuid4())
            try:
                await self.graph_store.create_concept(
                    id=cid,
                    name=c.get("name", "Unknown"),
                    description=c.get("description", ""),
                    difficulty=c.get("difficulty", difficulty),
                    domain=c.get("domain", domain),
                )
                concept_name_to_id[c.get("name", "").lower()] = cid
                nodes_created += 1
            except Exception as e:
                log.warning("ingestion.concept_create_failed", error=str(e))

        # ── Step 4: Create prerequisite edges ─────────────────────────────
        edges_created = 0
        for c in concepts_raw:
            name = c.get("name", "").lower()
            from_id = concept_name_to_id.get(name)
            if not from_id:
                continue
            for prereq_name in c.get("prerequisites", []):
                to_id = concept_name_to_id.get(prereq_name.lower())
                if to_id and to_id != from_id:
                    try:
                        # prereq must be learned BEFORE this concept
                        await self.graph_store.create_prerequisite(to_id, from_id)
                        edges_created += 1
                    except Exception as e:
                        log.warning("ingestion.edge_create_failed", error=str(e))

        # ── Step 5: Embed chunks and write to Qdrant ───────────────────────
        all_concept_ids = list(concept_name_to_id.values())
        chunks_written = 0
        batch_size = 10

        for i in range(0, len(raw_chunks), batch_size):
            batch = raw_chunks[i: i + batch_size]
            batch_points = []

            for j, chunk_text in enumerate(batch):
                chunk_id = str(uuid.uuid4())
                try:
                    vector = await self.pipeline.embed(chunk_text)
                    batch_points.append({
                        "id": chunk_id,
                        "vector": vector,
                        "text": chunk_text,
                        "source_doc_id": source_doc_id,
                        "chunk_index": i + j,
                        "concept_ids": all_concept_ids,
                        "difficulty": difficulty,
                        "domain": domain,
                        "content_type": content_type,
                        "token_count": len(chunk_text.split()),
                        "ingestion_job_id": ingestion_job_id,
                    })
                except Exception as e:
                    log.warning("ingestion.embed_failed", chunk_idx=i + j, error=str(e))

            if batch_points:
                n = await self.vector_store.upsert_chunks(batch_points)
                chunks_written += n

                # Link chunks to concepts in graph
                for point in batch_points:
                    for cid in all_concept_ids[:3]:  # link to top 3 concepts
                        try:
                            await self.graph_store.link_chunk_to_concept(
                                point["id"], cid, relevance=0.8
                            )
                        except Exception:
                            pass

            log.info("ingestion.batch", batch=i // batch_size + 1, written=chunks_written)
            await asyncio.sleep(0.1)  # Rate limit embeddings API

        stats = {
            "chunks_written": chunks_written,
            "nodes_created": nodes_created,
            "edges_created": edges_created,
        }
        log.info("ingestion.complete", **stats)
        return stats

    async def ingest_file(
        self,
        file_path: str,
        document_name: str,
        content_type: str,
        domain: str = "general",
        difficulty: int = 3,
        ingestion_job_id: str = "",
    ) -> dict:
        """Ingest a local file."""
        text = extract_text_from_file(file_path, content_type)
        source_doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, file_path))
        return await self.ingest_text(
            text=text,
            document_name=document_name,
            source_doc_id=source_doc_id,
            content_type=content_type,
            domain=domain,
            difficulty=difficulty,
            ingestion_job_id=ingestion_job_id,
        )


def get_ingestion_service() -> IngestionService:
    return IngestionService()
