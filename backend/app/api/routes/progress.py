from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.database import User, Message, LearningSession, QuizAttempt, get_db
from app.models.schemas import ProgressStats, QuizQuestion, QuizSubmission, QuizResult
from app.core.graph_store import get_graph_store
from app.core.rag_pipeline import get_rag_pipeline
from app.api.routes.auth import get_current_user

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/stats", response_model=ProgressStats)
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    graph = get_graph_store()

    # Mastery breakdown
    mastery = await graph.get_user_mastery(str(user.id))
    state_counts = {"mastered": 0, "in_progress": 0, "untouched": 0, "review": 0}
    total_confidence = 0.0
    for m in mastery:
        state = m.get("state", "untouched")
        state_counts[state] = state_counts.get(state, 0) + 1
        total_confidence += m.get("confidence", 0.0)

    total_concepts_result = await db.execute(
        select(func.count()).select_from(User)
    )

    # Session count
    session_result = await db.execute(
        select(func.count(LearningSession.id)).where(LearningSession.user_id == user.id)
    )
    session_count = session_result.scalar() or 0

    # Message count
    msg_result = await db.execute(
        select(func.count(Message.id))
        .join(LearningSession)
        .where(LearningSession.user_id == user.id)
    )
    msg_count = msg_result.scalar() or 0

    # Quiz accuracy
    quiz_result = await db.execute(
        select(func.count(QuizAttempt.id), func.sum(
            func.cast(QuizAttempt.correct, db.get_bind().dialect.NUMERIC if hasattr(db.get_bind(), 'dialect') else type(1))
        )).where(QuizAttempt.user_id == user.id)
    )
    quiz_total, quiz_correct = 0, 0
    try:
        row = quiz_result.one()
        quiz_total = row[0] or 0
        quiz_correct = int(row[1] or 0)
    except Exception:
        pass

    total = len(mastery)
    avg_conf = total_confidence / total if total else 0.0

    return ProgressStats(
        total_concepts=total,
        mastered=state_counts.get("mastered", 0),
        in_progress=state_counts.get("in_progress", 0),
        untouched=state_counts.get("untouched", 0),
        average_confidence=round(avg_conf, 2),
        total_sessions=session_count,
        total_messages=msg_count,
        quiz_accuracy=round(quiz_correct / quiz_total, 2) if quiz_total > 0 else 0.0,
    )


@router.get("/quiz/{concept_id}", response_model=QuizQuestion)
async def get_quiz(
    concept_id: str,
    user: User = Depends(get_current_user),
):
    graph = get_graph_store()
    pipeline = get_rag_pipeline()

    concepts = await graph.get_all_concepts()
    concept = next((c for c in concepts if c.get("id") == concept_id), None)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    question_data = await pipeline.generate_quiz_question(
        concept_name=concept["name"],
        concept_description=concept.get("description", ""),
        difficulty=concept.get("difficulty", 3),
    )
    if not question_data:
        raise HTTPException(status_code=500, detail="Failed to generate question")

    return QuizQuestion(
        concept_id=concept_id,
        concept_name=concept["name"],
        question=question_data.get("question", ""),
        options=question_data.get("options", []),
        correct_index=question_data.get("correct_index", 0),
        explanation=question_data.get("explanation", ""),
    )


@router.post("/quiz/submit", response_model=QuizResult)
async def submit_quiz(
    body: QuizSubmission,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    graph = get_graph_store()
    correct = body.selected_index == body.correct_index

    # Update mastery confidence
    mastery = await graph.get_user_mastery(str(user.id))
    current = next(
        (m for m in mastery if m["concept_id"] == body.concept_id), None
    )
    current_conf = current["confidence"] if current else 0.3
    delta = 0.15 if correct else -0.1
    new_conf = max(0.0, min(1.0, current_conf + delta))
    state = "mastered" if new_conf >= 0.8 else "in_progress" if new_conf >= 0.4 else "review"

    await graph.update_mastery(str(user.id), body.concept_id, state, new_conf)

    attempt = QuizAttempt(
        user_id=user.id,
        concept_id=body.concept_id,
        question_text=body.question_text,
        user_answer=str(body.selected_index),
        correct=correct,
        confidence_delta=delta,
    )
    db.add(attempt)
    await db.commit()

    return QuizResult(
        correct=correct,
        explanation="",
        confidence_delta=delta,
        new_confidence=new_conf,
    )
