import uuid
from typing import Any
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    SearchRequest,
    ScoredPoint,
)
import structlog

from app.config import settings

log = structlog.get_logger()


class VectorStore:
    """Qdrant vector store with hybrid search support."""

    def __init__(self):
        self.client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
        )
        self.collection = settings.qdrant_collection
        self.dim = settings.embedding_dimensions

    async def ensure_collection(self):
        """Create collection if it doesn't exist."""
        collections = await self.client.get_collections()
        names = [c.name for c in collections.collections]
        if self.collection not in names:
            await self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(
                    size=self.dim,
                    distance=Distance.COSINE,
                ),
            )
            log.info("qdrant.collection_created", name=self.collection)

    async def upsert_chunks(self, chunks: list[dict]) -> int:
        """
        Upsert a list of content chunks.

        Each chunk dict must have:
          - id: str (UUID)
          - vector: list[float]
          - text: str
          - source_doc_id: str
          - chunk_index: int
          - concept_ids: list[str]
          - difficulty: int
          - domain: str
          - content_type: str
        """
        points = [
            PointStruct(
                id=c["id"],
                vector=c["vector"],
                payload={
                    "text": c["text"],
                    "source_doc_id": c["source_doc_id"],
                    "chunk_index": c["chunk_index"],
                    "concept_ids": c.get("concept_ids", []),
                    "difficulty": c.get("difficulty", 3),
                    "domain": c.get("domain", "general"),
                    "content_type": c.get("content_type", "text"),
                    "token_count": c.get("token_count", 0),
                    "ingestion_job_id": c.get("ingestion_job_id", ""),
                },
            )
            for c in chunks
        ]
        await self.client.upsert(collection_name=self.collection, points=points)
        return len(points)

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 8,
        domain_filter: str | None = None,
        max_difficulty: int | None = None,
        concept_ids: list[str] | None = None,
    ) -> list[dict]:
        """Semantic vector search with optional payload filters."""
        filters = []

        if domain_filter:
            filters.append(
                FieldCondition(key="domain", match=MatchValue(value=domain_filter))
            )
        if max_difficulty:
            from qdrant_client.models import Range
            filters.append(
                FieldCondition(key="difficulty", range=Range(lte=max_difficulty))
            )

        qdrant_filter = Filter(must=filters) if filters else None

        results = await self.client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
            with_payload=True,
        )

        return [
            {
                "chunk_id": str(r.id),
                "score": r.score,
                "text": r.payload.get("text", ""),
                "source_doc_id": r.payload.get("source_doc_id", ""),
                "concept_ids": r.payload.get("concept_ids", []),
                "difficulty": r.payload.get("difficulty", 3),
                "domain": r.payload.get("domain", "general"),
                "content_type": r.payload.get("content_type", "text"),
            }
            for r in results
        ]

    async def delete_by_source(self, source_doc_id: str) -> int:
        """Delete all chunks belonging to a source document."""
        result = await self.client.delete(
            collection_name=self.collection,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="source_doc_id", match=MatchValue(value=source_doc_id)
                    )
                ]
            ),
        )
        return result.status

    async def get_collection_info(self) -> dict:
        info = await self.client.get_collection(self.collection)
        return {
            "vectors_count": info.vectors_count,
            "indexed_vectors_count": info.indexed_vectors_count,
            "status": str(info.status),
        }


# Singleton
_vector_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store
