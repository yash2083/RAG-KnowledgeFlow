import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import aiofiles
import os

from app.models.database import User, IngestionJob, IngestionStatus, ContentType, get_db
from app.models.schemas import IngestionJobOut
from app.core.ingestion import get_ingestion_service
from app.api.routes.auth import get_current_user

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

UPLOAD_DIR = "/tmp/knowledgeflow_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=IngestionJobOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    domain: str = Form(default="general"),
    difficulty: int = Form(default=3),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Determine content type
    suffix = file.filename.split(".")[-1].lower() if file.filename else "text"
    ct_map = {"pdf": "pdf", "docx": "docx", "md": "markdown", "txt": "text"}
    content_type = ct_map.get(suffix, "text")

    # Save file
    job_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Create job record
    job = IngestionJob(
        id=job_id,
        document_name=file.filename or "unnamed",
        content_type=ContentType(content_type),
        status=IngestionStatus.processing,
        job_metadata={"domain": domain, "difficulty": difficulty},
    )
    db.add(job)
    await db.flush()

    # Run ingestion (in production this would be a Celery task)
    service = get_ingestion_service()
    try:
        stats = await service.ingest_file(
            file_path=file_path,
            document_name=file.filename or "unnamed",
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
    except Exception as e:
        job.status = IngestionStatus.failed
        job.error_log = str(e)

    await db.commit()
    os.remove(file_path)
    return IngestionJobOut.model_validate(job)


@router.post("/text", response_model=IngestionJobOut, status_code=201)
async def ingest_raw_text(
    content: str = Form(...),
    document_name: str = Form(...),
    domain: str = Form(default="general"),
    difficulty: int = Form(default=3),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingest raw text content directly."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    job_id = str(uuid.uuid4())
    source_doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, document_name))

    job = IngestionJob(
        id=job_id,
        document_name=document_name,
        content_type=ContentType.markdown,
        status=IngestionStatus.processing,
    )
    db.add(job)
    await db.flush()

    service = get_ingestion_service()
    try:
        stats = await service.ingest_text(
            text=content,
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
    except Exception as e:
        job.status = IngestionStatus.failed
        job.error_log = str(e)

    await db.commit()
    return IngestionJobOut.model_validate(job)


@router.get("/jobs", response_model=list[IngestionJobOut])
async def list_jobs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.execute(
        select(IngestionJob).order_by(IngestionJob.created_at.desc()).limit(50)
    )
    return [IngestionJobOut.model_validate(j) for j in result.scalars().all()]


@router.get("/jobs/{job_id}", response_model=IngestionJobOut)
async def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.execute(
        select(IngestionJob).where(IngestionJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return IngestionJobOut.model_validate(job)
