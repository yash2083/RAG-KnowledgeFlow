import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import User, LearningSession, Message, MessageRole, get_db
from app.models.schemas import ChatRequest
from app.core.rag_pipeline import get_rag_pipeline
from app.core.graph_store import get_graph_store
from app.api.routes.auth import get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])


async def _event(type: str, data: dict) -> str:
    return f"data: {json.dumps({'type': type, **data})}\n\n"


@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    SSE endpoint: streams token-by-token LLM response with metadata events.
    Event types: metadata | token | graph_update | done | error
    """
    pipeline = get_rag_pipeline()
    graph = get_graph_store()

    # ── Session management ────────────────────────────────────────────────
    session_id = body.session_id
    if session_id:
        result = await db.execute(
            select(LearningSession).where(
                LearningSession.id == session_id,
                LearningSession.user_id == user.id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = LearningSession(user_id=user.id)
        db.add(session)
        await db.flush()
        session_id = session.id

    # ── Load conversation history ──────────────────────────────────────────
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .limit(12)
    )
    history_msgs = result.scalars().all()
    history = [{"role": m.role.value, "content": m.content} for m in history_msgs]

    # ── Save user message ──────────────────────────────────────────────────
    user_msg = Message(
        session_id=session_id,
        role=MessageRole.user,
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()

    difficulty = body.difficulty_override or user.preferred_difficulty

    async def generate():
        full_response = ""
        retrieved_chunk_ids = []
        highlighted_concept_ids = []

        try:
            # ── Retrieve ───────────────────────────────────────────────────
            chunks, concept_ids = await pipeline.retrieve(
                query=body.message,
                user_id=str(user.id),
                difficulty_max=difficulty,
                concept_filter=body.concept_filter,
            )
            retrieved_chunk_ids = [c.get("chunk_id", "") for c in chunks]
            highlighted_concept_ids = concept_ids

            # ── Metadata event ─────────────────────────────────────────────
            sources = [
                {
                    "chunk_id": c.get("chunk_id"),
                    "source": c.get("source_doc_id", ""),
                    "score": round(c.get("score", 0), 3),
                }
                for c in chunks[:5]
            ]
            yield await _event("metadata", {
                "session_id": str(session_id),
                "difficulty": difficulty,
                "sources": sources,
                "chunk_count": len(chunks),
            })

            # ── Graph update event ─────────────────────────────────────────
            if concept_ids:
                neighborhood = await graph.get_concept_neighborhood(
                    concept_ids[0], hops=1, user_id=str(user.id)
                ) if concept_ids else {"nodes": [], "edges": []}
                yield await _event("graph_update", {
                    "highlighted_node_ids": highlighted_concept_ids,
                    "nodes": neighborhood.get("nodes", [])[:20],
                    "edges": neighborhood.get("edges", [])[:40],
                })

            # ── Stream tokens ──────────────────────────────────────────────
            async for token in pipeline.generate_stream(
                query=body.message,
                history=history,
                chunks=chunks,
                difficulty=difficulty,
            ):
                full_response += token
                yield await _event("token", {"content": token})

            # ── Done event ─────────────────────────────────────────────────
            yield await _event("done", {
                "session_id": str(session_id),
                "message_id": str(uuid.uuid4()),
                "total_tokens": len(full_response.split()),
            })

            # ── Persist assistant message ──────────────────────────────────
            assistant_msg = Message(
                session_id=session_id,
                role=MessageRole.assistant,
                content=full_response,
                retrieved_chunk_ids=retrieved_chunk_ids,
                graph_node_ids=highlighted_concept_ids,
                difficulty_level=difficulty,
            )
            db.add(assistant_msg)
            await db.commit()

        except Exception as e:
            yield await _event("error", {"message": str(e)})
            await db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions")
async def list_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningSession)
        .where(LearningSession.user_id == user.id)
        .order_by(LearningSession.started_at.desc())
        .limit(20)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "topic_focus": s.topic_focus,
            "started_at": s.started_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .join(LearningSession)
        .where(
            LearningSession.id == session_id,
            LearningSession.user_id == user.id,
        )
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "role": m.role.value,
            "content": m.content,
            "difficulty_level": m.difficulty_level,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]
