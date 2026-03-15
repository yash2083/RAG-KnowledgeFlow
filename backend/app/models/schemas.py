from pydantic import BaseModel, EmailStr, Field
from typing import Any
from datetime import datetime
from uuid import UUID
from enum import Enum


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    is_admin: bool
    preferred_difficulty: int
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: UUID | None = None
    difficulty_override: int | None = Field(default=None, ge=1, le=5)
    concept_filter: str | None = None  # Focus retrieval on a specific concept


class ChatResponseChunk(BaseModel):
    type: str  # "token" | "metadata" | "graph_update" | "done"
    content: str | None = None
    metadata: dict | None = None


class SourceChunk(BaseModel):
    chunk_id: str
    text: str
    source: str
    relevance_score: float
    concept_ids: list[str]


class GraphUpdate(BaseModel):
    new_nodes: list[dict]
    new_edges: list[dict]
    highlighted_nodes: list[str]


# ─── Graph ────────────────────────────────────────────────────────────────────

class ConceptNode(BaseModel):
    id: str
    name: str
    description: str
    difficulty: int
    domain: str
    mastery_confidence: float = 0.0
    mastery_state: str = "untouched"  # untouched | in_progress | mastered | review


class ConceptEdge(BaseModel):
    source: str
    target: str
    relationship: str  # PREREQUISITE_OF | RELATED_TO | REFERENCED_BY
    strength: float = 1.0


class GraphResponse(BaseModel):
    nodes: list[ConceptNode]
    edges: list[ConceptEdge]
    center_node_id: str | None = None


class ConceptCreate(BaseModel):
    name: str
    description: str
    difficulty: int = Field(ge=1, le=5)
    domain: str
    prerequisite_ids: list[str] = []


class LearningPathResponse(BaseModel):
    path: list[ConceptNode]
    total_concepts: int
    estimated_hours: float
    mastered_count: int


# ─── Ingestion ────────────────────────────────────────────────────────────────

class IngestionRequest(BaseModel):
    document_url: str | None = None
    document_name: str
    content_type: str
    metadata: dict[str, Any] = {}


class IngestionJobOut(BaseModel):
    id: UUID
    document_name: str
    content_type: str
    status: str
    chunks_written: int
    nodes_created: int
    edges_created: int
    error_log: str | None
    created_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


# ─── Progress ─────────────────────────────────────────────────────────────────

class ProgressStats(BaseModel):
    total_concepts: int
    mastered: int
    in_progress: int
    untouched: int
    average_confidence: float
    total_sessions: int
    total_messages: int
    quiz_accuracy: float


class MasteryUpdate(BaseModel):
    concept_id: str
    state: str  # mastered | in_progress | review | untouched
    confidence: float = Field(ge=0.0, le=1.0)


# ─── Quiz ─────────────────────────────────────────────────────────────────────

class QuizQuestion(BaseModel):
    concept_id: str
    concept_name: str
    question: str
    options: list[str]
    correct_index: int
    explanation: str


class QuizSubmission(BaseModel):
    concept_id: str
    question_text: str
    selected_index: int
    correct_index: int


class QuizResult(BaseModel):
    correct: bool
    explanation: str
    confidence_delta: float
    new_confidence: float
