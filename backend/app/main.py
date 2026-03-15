import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.database import create_all_tables
from app.core.vector_store import get_vector_store
from app.core.graph_store import get_graph_store
from app.api.routes import auth, chat, graph, ingestion, progress

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup.begin")

    # Initialize database tables
    await create_all_tables()
    log.info("startup.db_ready")

    # Initialize vector store collection
    vs = get_vector_store()
    await vs.ensure_collection()
    log.info("startup.qdrant_ready")

    # Initialize graph DB schema
    gs = get_graph_store()
    await gs.setup()
    log.info("startup.neo4j_ready")

    log.info("startup.complete", env=settings.environment)
    yield

    # Cleanup
    await gs.close()
    log.info("shutdown.complete")


app = FastAPI(
    title="KnowledgeFlow API",
    description="RAG-powered adaptive learning platform with knowledge graph",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(ingestion.router, prefix="/api/v1")
app.include_router(progress.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "env": settings.environment}


@app.get("/")
async def root():
    return {
        "name": "KnowledgeFlow API",
        "docs": "/docs",
        "version": "1.0.0",
    }
