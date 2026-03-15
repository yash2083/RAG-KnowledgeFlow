"""
Celery worker for async document ingestion.

In production, ingestion runs here instead of inline in the API route,
allowing the HTTP request to return immediately with a job ID.
"""
import asyncio
from celery import Celery
from app.config import settings

celery_app = Celery(
    "knowledgeflow",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


def run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(bind=True, name="ingest_file_task", max_retries=2)
def ingest_file_task(self, job_id: str, file_path: str, document_name: str,
                     content_type: str, domain: str = "general", difficulty: int = 3):
    """Async-safe wrapper: runs the ingestion service in an event loop."""
    from app.core.ingestion import get_ingestion_service
    from app.models.database import IngestionJob, IngestionStatus, async_session_maker
    from datetime import datetime

    async def _run():
        service = get_ingestion_service()
        async with async_session_maker() as db:
            job = await db.get(IngestionJob, job_id)
            if not job:
                return
            try:
                stats = await service.ingest_file(
                    file_path=file_path,
                    document_name=document_name,
                    content_type=content_type,
                    domain=domain,
                    difficulty=difficulty,
                    ingestion_job_id=job_id,
                )
                job.status = IngestionStatus.completed
                job.chunks_written = stats["chunks_written"]
                job.nodes_created = stats["nodes_created"]
                job.edges_created = stats["edges_created"]
                job.completed_at = datetime.utcnow()
            except Exception as exc:
                job.status = IngestionStatus.failed
                job.error_log = str(exc)
                raise self.retry(exc=exc, countdown=30)
            await db.commit()

    run_async(_run())


@celery_app.task(name="ingest_text_task")
def ingest_text_task(job_id: str, text: str, document_name: str,
                     source_doc_id: str, domain: str = "general", difficulty: int = 3):
    from app.core.ingestion import get_ingestion_service
    from app.models.database import IngestionJob, IngestionStatus, async_session_maker
    from datetime import datetime

    async def _run():
        service = get_ingestion_service()
        async with async_session_maker() as db:
            job = await db.get(IngestionJob, job_id)
            if not job:
                return
            try:
                stats = await service.ingest_text(
                    text=text,
                    document_name=document_name,
                    source_doc_id=source_doc_id,
                    domain=domain,
                    difficulty=difficulty,
                    ingestion_job_id=job_id,
                )
                job.status = IngestionStatus.completed
                job.chunks_written = stats["chunks_written"]
                job.nodes_created = stats["nodes_created"]
                job.edges_created = stats["edges_created"]
                job.completed_at = datetime.utcnow()
            except Exception as exc:
                job.status = IngestionStatus.failed
                job.error_log = str(exc)
            await db.commit()

    run_async(_run())
