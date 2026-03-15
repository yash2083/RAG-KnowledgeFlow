# KnowledgeFlow

> RAG-powered adaptive learning platform with live knowledge graph visualization

KnowledgeFlow combines a hybrid retrieval-augmented generation pipeline with a navigable Neo4j knowledge graph to deliver personalized, context-rich education. Every conversation grows your knowledge graph in real time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (Vite + TypeScript)                         │
│  ├── ChatPanel     — SSE streaming chat with Markdown       │
│  ├── GraphCanvas   — Cytoscape.js knowledge graph           │
│  ├── ConceptSidebar — Mastery tracking + inline quiz        │
│  └── ProgressDash  — Recharts mastery visualization         │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / SSE
┌──────────────────────────────▼──────────────────────────────┐
│  FastAPI Backend                                             │
│  ├── /api/v1/auth        — JWT authentication               │
│  ├── /api/v1/chat/stream — SSE RAG pipeline                 │
│  ├── /api/v1/graph       — Neo4j graph CRUD + traversal     │
│  ├── /api/v1/ingestion   — Document upload + processing     │
│  └── /api/v1/progress    — Stats + quiz engine              │
└───┬─────────────────────┬──────────────────┬────────────────┘
    │                     │                  │
┌───▼───┐  ┌─────────┐  ┌▼────────┐  ┌─────▼──────┐
│Qdrant │  │  Neo4j  │  │Postgres │  │  Redis     │
│Vector │  │  Graph  │  │  SQL    │  │  Cache/Queue│
│ Store │  │   DB    │  │   DB    │  │            │
└───────┘  └─────────┘  └─────────┘  └────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Graph viz | Cytoscape.js |
| State | Zustand + TanStack Query |
| Backend | FastAPI, Python 3.12 |
| RAG framework | LangChain |
| LLM | OpenAI GPT-4o |
| Embeddings | text-embedding-3-large (3072d) |
| Vector DB | Qdrant |
| Graph DB | Neo4j |
| SQL DB | PostgreSQL (asyncpg) |
| Job queue | Celery + Redis |
| Auth | JWT (python-jose) |
| Infra | Docker Compose → AWS ECS + Fargate |

---

## Quick Start

### Prerequisites
- Docker Desktop
- OpenAI API key

### 1. Clone and configure

```bash
git clone https://github.com/your-org/knowledgeflow
cd knowledgeflow
cp .env.example .env
# Edit .env: add your OPENAI_API_KEY
```

### 2. Start all services

```bash
docker compose up --build
```

This starts:
- PostgreSQL on :5432
- Redis on :6379
- Qdrant on :6333 (UI: http://localhost:6333/dashboard)
- Neo4j on :7687 (Browser: http://localhost:7474)
- FastAPI backend on :8000 (Docs: http://localhost:8000/docs)
- React frontend on :5173

### 3. Create an admin user

```bash
# Register via API
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"securepass","full_name":"Admin"}'

# Promote to admin directly in Postgres
docker compose exec postgres psql -U postgres -d knowledgeflow \
  -c "UPDATE users SET is_admin=true WHERE email='admin@example.com';"
```

### 4. Ingest content

```bash
# Get your token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"securepass"}' | jq -r .access_token)

# Ingest a PDF
curl -X POST http://localhost:8000/api/v1/ingestion/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@your-document.pdf" \
  -F "domain=machine-learning" \
  -F "difficulty=3"
```

Or use the Admin panel in the UI at http://localhost:5173/admin.

### 5. Open the app

Navigate to http://localhost:5173 and sign in.

---

## Project Structure

```
knowledgeflow/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI route handlers
│   │   │   ├── auth.py
│   │   │   ├── chat.py       # SSE streaming endpoint
│   │   │   ├── graph.py      # Neo4j graph API
│   │   │   ├── ingestion.py  # Document ingestion
│   │   │   └── progress.py   # Stats + quiz
│   │   ├── core/
│   │   │   ├── rag_pipeline.py    # Hybrid retrieval + LLM
│   │   │   ├── vector_store.py    # Qdrant client
│   │   │   ├── graph_store.py     # Neo4j client
│   │   │   └── ingestion.py       # Chunking + embedding
│   │   ├── models/
│   │   │   ├── database.py   # SQLAlchemy models
│   │   │   └── schemas.py    # Pydantic schemas
│   │   ├── config.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/         # ChatPanel with SSE streaming
│   │   │   ├── graph/        # GraphCanvas + ConceptSidebar
│   │   │   ├── dashboard/    # ProgressDashboard
│   │   │   ├── admin/        # AdminPanel
│   │   │   └── layout/       # TopNav, LearnPage, AuthPage
│   │   ├── stores/           # Zustand stores
│   │   ├── lib/              # API client + SSE helper
│   │   ├── types/            # TypeScript interfaces
│   │   └── App.tsx
│   ├── tailwind.config.js
│   └── package.json
├── docker-compose.yml
└── .env.example
```

---

## Development

### Backend only

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

### Running tests

```bash
cd backend
pytest tests/ -v
```

---

## Key Design Decisions

**Hybrid retrieval.** Vector similarity alone misses structural knowledge relationships. The graph traversal layer finds prerequisite chains and related concepts that pure semantic search cannot discover from embedding distance alone.

**Transactional ingestion.** Every chunk is written to Qdrant with a `concept_ids` payload field that maps back to Neo4j nodes. This means the vector store can be queried independently, then enriched with graph data in a single subsequent lookup — no join service required.

**SSE over WebSockets.** Server-sent events are simpler to proxy and cache than WebSockets for unidirectional token streaming. The `graph_update` event type is interleaved with `token` events so the frontend graph canvas animates in sync with the text response.

**Cytoscape.js for graph visualization.** Cytoscape's Cypher-like selector API and built-in COSE layout engine handle directed graphs with weighted edges without requiring D3's lower-level force simulation setup. Node click events bind directly to the store's `setActiveNode` action.

---

## Roadmap

- [ ] Phase 2: Spaced repetition scheduler based on Ebbinghaus forgetting curve
- [ ] Phase 2: Multi-modal ingestion (video transcripts via Whisper)
- [ ] Phase 3: Collaborative learning paths (shared concept maps)
- [ ] Phase 4: LangSmith evaluation harness for retrieval quality
- [ ] Phase 5: Multi-tenancy + institution-level graph isolation
- [ ] Phase 5: Content marketplace for community-contributed knowledge graphs

---

## License

MIT
