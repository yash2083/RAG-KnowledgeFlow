from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "KnowledgeFlow API"
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=True, env="DEBUG")
    secret_key: str = Field(default="change-me-in-production", env="SECRET_KEY")

    # CORS
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Groq
    groq_api_key: str = Field(default="", env="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.3-70b-versatile", env="GROQ_MODEL")
    # Local sentence-transformers embeddings (no external API required)
    embedding_model: str = Field(
        default="all-MiniLM-L6-v2", env="EMBEDDING_MODEL"
    )
    embedding_dimensions: int = 384

    # Qdrant (Vector DB)
    qdrant_url: str = Field(default="http://localhost:6333", env="QDRANT_URL")
    qdrant_api_key: str = Field(default="", env="QDRANT_API_KEY")
    qdrant_collection: str = Field(default="knowledgeflow", env="QDRANT_COLLECTION")

    # Neo4j (Graph DB)
    neo4j_uri: str = Field(default="bolt://localhost:7687", env="NEO4J_URI")
    neo4j_user: str = Field(default="neo4j", env="NEO4J_USER")
    neo4j_password: str = Field(default="password", env="NEO4J_PASSWORD")

    # PostgreSQL
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:password@localhost:5432/knowledgeflow",
        env="DATABASE_URL",
    )

    # Redis / Celery
    redis_url: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")

    # RAG settings
    top_k_vector: int = 8
    top_k_graph: int = 5
    max_context_tokens: int = 8000
    chunk_size: int = 512
    chunk_overlap: int = 64

    # Auth
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    algorithm: str = "HS256"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
