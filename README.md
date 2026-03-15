# 🧠 RAG KnowledgeFlow

> **RAG-powered adaptive learning platform** with live knowledge graph visualization, powered by Groq (Llama 3.3 70B) and local sentence embeddings.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Llama%203.3%2070B-orange)](https://groq.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ What is KnowledgeFlow?

KnowledgeFlow is a full-stack **Retrieval-Augmented Generation (RAG)** learning platform. Upload any document (PDF, Markdown, DOCX), and it:

- **Extracts knowledge** → Uses an LLM to pull out concept nodes and relationships
- **Builds a knowledge graph** → Stores everything in Neo4j as an interactive concept map
- **Enables smart Q&A** → Hybrid vector + graph retrieval gives context-rich, cited answers
- **Adapts to you** → Tracks mastery per concept, adjusts difficulty, generates inline quizzes

Every conversation grows your knowledge graph in real time. ✨

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React 18 Frontend (Vite + TypeScript + Tailwind CSS)       │
│  ├── ChatPanel     — Streaming chat (SSE) + Markdown        │
│  ├── GraphCanvas   — Cytoscape.js knowledge graph           │
│  ├── ConceptSidebar — Mastery tracking + inline quiz        │
│  └── ProgressDash  — Recharts mastery visualization         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / SSE
┌───────────────────────────▼─────────────────────────────────┐
│  FastAPI Backend (Python 3.12)                               │
│  ├── /api/v1/auth        — JWT auth (bypassed in dev)       │
│  ├── /api/v1/chat/stream — SSE RAG pipeline                 │
│  ├── /api/v1/graph       — Neo4j CRUD + traversal           │
│  ├── /api/v1/ingestion   — Document upload + processing     │
│  └── /api/v1/progress    — Stats + quiz engine              │
└───┬───────────────┬──────────────────┬───────────────────────┘
    │               │                  │
┌───▼───┐  ┌────────▼──┐  ┌───────────▼──┐  ┌──────────────┐
│Qdrant │  │   Neo4j   │  │  PostgreSQL  │  │   Redis      │
│(384d  │  │  Graph DB │  │   SQL DB     │  │ Celery Queue │
│ vecs) │  │           │  │              │  │              │
└───────┘  └───────────┘  └──────────────┘  └──────────────┘
                ▲
        Celery Worker
    (async ingestion tasks)
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Graph Viz** | Cytoscape.js |
| **State** | Zustand + TanStack Query |
| **Backend** | FastAPI, Python 3.12, asyncio |
| **LLM** | 🟠 **Groq** — `llama-3.3-70b-versatile` (ultra-fast inference) |
| **Embeddings** | 🆓 **Local** — `sentence-transformers/all-MiniLM-L6-v2` (no API cost) |
| **Vector DB** | Qdrant (384-dim cosine similarity) |
| **Graph DB** | Neo4j 5.21 |
| **SQL DB** | PostgreSQL 16 (asyncpg) |
| **Job Queue** | Celery + Redis |
| **Auth** | JWT (python-jose) — bypassed in dev mode |
| **Infra** | Docker Compose |

---

## 🚀 Quick Start

### Prerequisites
- **Docker Desktop** (running)
- **Groq API key** — free at [console.groq.com](https://console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/yash2083/RAG-KnowledgeFlow.git
cd RAG-KnowledgeFlow
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set your Groq API key:

```env
GROQ_API_KEY=gsk_your_key_here
```

That's the **only** required key — embeddings run locally for free!

### 3. Start all services

```bash
docker compose up --build
```

This spins up 6 services:

| Service | URL |
|---------|-----|
| 🌐 Frontend | http://localhost:5173 |
| ⚡ Backend API | http://localhost:8000 |
| 📚 API Docs | http://localhost:8000/docs |
| 🔍 Qdrant Dashboard | http://localhost:6333/dashboard |
| 🕸️ Neo4j Browser | http://localhost:7474 |

> **No login required** — dev mode auto-authenticates as admin.

### 4. Seed sample data (optional)

```bash
make seed
```

This ingests a sample ML curriculum so you can explore the app immediately.

### 5. Ingest your own content

Use the **Admin Panel** at http://localhost:5173/admin, or via API:

```bash
# Ingest a PDF
curl -X POST http://localhost:8000/api/v1/ingestion/upload \
  -F "file=@your-document.pdf" \
  -F "domain=machine-learning" \
  -F "difficulty=3"

# Ingest raw text
curl -X POST http://localhost:8000/api/v1/ingestion/text \
  -H "Content-Type: application/json" \
  -d '{"text": "...", "document_name": "My Notes", "domain": "physics"}'
```

---

## 📁 Project Structure

```
RAG-KnowledgeFlow/
├── backend/
│   ├── app/
│   │   ├── api/routes/        # FastAPI endpoints
│   │   │   ├── auth.py        # Auth (bypassed in dev)
│   │   │   ├── chat.py        # SSE streaming chat
│   │   │   ├── graph.py       # Knowledge graph API
│   │   │   ├── ingestion.py   # Document ingestion
│   │   │   └── progress.py    # Stats + quiz engine
│   │   ├── core/
│   │   │   ├── rag_pipeline.py     # Groq LLM + hybrid RAG
│   │   │   ├── ingestion.py        # Chunking + embedding
│   │   │   ├── vector_store.py     # Qdrant client
│   │   │   └── graph_store.py      # Neo4j client
│   │   ├── models/
│   │   │   ├── database.py    # SQLAlchemy ORM models
│   │   │   └── schemas.py     # Pydantic request/response schemas
│   │   ├── workers/
│   │   │   └── celery_app.py  # Async ingestion tasks
│   │   ├── config.py          # Pydantic settings
│   │   └── main.py            # FastAPI app + startup
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/          # ChatPanel (SSE streaming)
│   │   │   ├── graph/         # GraphCanvas + ConceptSidebar
│   │   │   ├── dashboard/     # ProgressDashboard
│   │   │   ├── admin/         # AdminPanel (ingestion UI)
│   │   │   └── layout/        # TopNav, LearnPage, AuthPage
│   │   ├── stores/            # Zustand global state
│   │   ├── lib/               # API client + SSE helper
│   │   ├── types/             # TypeScript interfaces
│   │   └── App.tsx            # Router + auto-login
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── .env.example
└── Makefile
```

---

## ⚙️ How the RAG Pipeline Works

```
User Query
    │
    ▼
[1] Local Embedding (sentence-transformers, 384d)
    │
    ▼
[2] Vector Search → Qdrant (top-K cosine similarity)
    │
    ▼
[3] Graph Traversal → Neo4j (find related concept nodes)
    │
    ▼
[4] Hybrid Re-rank (vector score + graph relevance)
    │
    ▼
[5] Context Assembly (chunks + sources)
    │
    ▼
[6] Groq LLM Stream → llama-3.3-70b-versatile (SSE tokens)
    │
    ▼
[7] Frontend renders Markdown + animates graph nodes
```

---

## 🔧 Development

### Run backend locally (without Docker)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Run frontend locally

```bash
cd frontend
npm install
npm run dev
```

### Run tests

```bash
cd backend && pytest tests/ -v
```

### Useful Make commands

```bash
make seed        # Ingest sample ML curriculum
make logs        # Tail all Docker container logs
```

---

## 🎯 Key Design Decisions

**🔀 Hybrid Retrieval** — Vector similarity finds semantically related chunks, while Neo4j graph traversal surfaces prerequisite chains and cross-domain connections that pure embedding distance misses.

**🆓 Free Embeddings** — Using `sentence-transformers/all-MiniLM-L6-v2` locally eliminates per-request embedding costs entirely. 384-dim vectors are fast enough for real-time RAG with Qdrant's HNSW index.

**⚡ Groq for Speed** — Groq's LPU architecture delivers ~10x faster token generation vs hosted GPU APIs, making SSE streaming feel near-instant to the user.

**📡 SSE over WebSockets** — Server-sent events are simpler to proxy and cache for unidirectional token streaming. The frontend interleaves `token` and `graph_update` events so the knowledge graph animates in sync with the streamed text.

---

## 🗺️ Roadmap

- [ ] Spaced repetition scheduler (Ebbinghaus forgetting curve)
- [ ] Multi-modal ingestion (YouTube transcripts via Whisper)
- [ ] Collaborative learning paths (shared concept maps)
- [ ] LangSmith evaluation harness for retrieval quality
- [ ] Multi-tenancy + institution-level graph isolation

---

## 📄 License

MIT © 2024
