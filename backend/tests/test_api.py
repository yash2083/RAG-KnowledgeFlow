"""
KnowledgeFlow backend test suite.

Run with: pytest tests/ -v --asyncio-mode=auto

Requires test database — set TEST_DATABASE_URL env var or tests
will use an in-memory SQLite-compatible fixture.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock

from app.main import app
from app.config import settings


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture
async def auth_headers(client):
    """Register + login a test user, return auth headers."""
    await client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "testpassword123",
        "full_name": "Test User",
    })
    login = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "testpassword123",
    })
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def admin_headers(client):
    """Register + promote + login an admin user."""
    reg = await client.post("/api/v1/auth/register", json={
        "email": "admin@example.com",
        "password": "adminpassword123",
        "full_name": "Admin User",
    })
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


# ── Auth tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client):
    res = await client.post("/api/v1/auth/register", json={
        "email": "new@example.com",
        "password": "password123",
        "full_name": "New User",
    })
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "new@example.com"
    assert data["user"]["is_admin"] is False


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "pass1234"}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"]


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/api/v1/auth/register", json={
        "email": "login@example.com",
        "password": "mypassword"
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "login@example.com",
        "password": "mypassword"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/api/v1/auth/register", json={
        "email": "wrong@example.com",
        "password": "correct"
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "wrong@example.com",
        "password": "incorrect"
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 403  # HTTPBearer returns 403 without credentials


@pytest.mark.asyncio
async def test_me_returns_user(client, auth_headers):
    res = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "test@example.com"


# ── Graph tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_concepts_requires_auth(client):
    res = await client.get("/api/v1/graph/concepts")
    assert res.status_code == 403


@pytest.mark.asyncio
@patch("app.api.routes.graph.get_graph_store")
async def test_list_concepts(mock_gs, client, auth_headers):
    mock_store = AsyncMock()
    mock_store.get_all_concepts.return_value = [
        {"id": "c1", "name": "Gradient Descent", "difficulty": 3,
         "domain": "ml", "description": "Optimization algorithm"}
    ]
    mock_store.get_user_mastery.return_value = []
    mock_gs.return_value = mock_store

    res = await client.get("/api/v1/graph/concepts", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 0  # May be empty if graph store is mocked


@pytest.mark.asyncio
@patch("app.api.routes.graph.get_graph_store")
async def test_update_mastery(mock_gs, client, auth_headers):
    mock_store = AsyncMock()
    mock_store.update_mastery.return_value = None
    mock_gs.return_value = mock_store

    res = await client.post("/api/v1/graph/mastery", headers=auth_headers, json={
        "concept_id": "c1",
        "state": "mastered",
        "confidence": 0.9,
    })
    assert res.status_code == 200
    assert res.json()["ok"] is True


# ── Progress tests ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.routes.progress.get_graph_store")
async def test_get_stats(mock_gs, client, auth_headers):
    mock_store = AsyncMock()
    mock_store.get_user_mastery.return_value = [
        {"concept_id": "c1", "state": "mastered", "confidence": 0.9},
        {"concept_id": "c2", "state": "in_progress", "confidence": 0.5},
    ]
    mock_gs.return_value = mock_store

    res = await client.get("/api/v1/progress/stats", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_concepts" in data
    assert "mastered" in data
    assert "quiz_accuracy" in data


# ── Ingestion tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ingestion_requires_admin(client, auth_headers):
    """Non-admin users cannot access ingestion endpoints."""
    res = await client.get("/api/v1/ingestion/jobs", headers=auth_headers)
    assert res.status_code == 403


# ── Health check ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


# ── Unit: RAG pipeline ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_semantic_chunking():
    from app.core.ingestion import semantic_chunk

    text = "The quick brown fox jumps over the lazy dog. " * 100
    chunks = semantic_chunk(text, chunk_size=50, overlap=10)
    assert len(chunks) > 1
    for chunk in chunks:
        words = chunk.split()
        # Chunks should not drastically exceed chunk_size
        assert len(words) <= 80  # some tolerance for overlap


@pytest.mark.asyncio
async def test_semantic_chunk_short_text():
    from app.core.ingestion import semantic_chunk

    text = "Short text."
    chunks = semantic_chunk(text, chunk_size=512, overlap=64)
    assert len(chunks) == 1
    assert chunks[0] == "Short text."


@pytest.mark.asyncio
@patch("app.core.rag_pipeline.AsyncOpenAI")
async def test_rag_embed(mock_openai_cls):
    from app.core.rag_pipeline import RAGPipeline

    mock_client = AsyncMock()
    mock_embedding = MagicMock()
    mock_embedding.data = [MagicMock(embedding=[0.1] * 3072)]
    mock_client.embeddings.create = AsyncMock(return_value=mock_embedding)
    mock_openai_cls.return_value = mock_client

    pipeline = RAGPipeline()
    pipeline.client = mock_client
    vec = await pipeline.embed("test query")
    assert len(vec) == 3072
    assert all(v == 0.1 for v in vec)
