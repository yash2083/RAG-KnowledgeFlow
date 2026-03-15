// ── Auth ──────────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  preferred_difficulty: number
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
  user: User
}

// ── Graph ─────────────────────────────────────────────────────────────────
export type MasteryState = 'untouched' | 'in_progress' | 'mastered' | 'review'

export interface ConceptNode {
  id: string
  name: string
  description: string
  difficulty: number
  domain: string
  mastery_confidence: number
  mastery_state: MasteryState
}

export interface ConceptEdge {
  source: string
  target: string
  relationship: 'PREREQUISITE_OF' | 'RELATED_TO' | 'REFERENCED_BY'
  strength: number
}

export interface GraphData {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  center_node_id?: string
}

export interface LearningPath {
  path: ConceptNode[]
  total_concepts: number
  estimated_hours: number
  mastered_count: number
}

// ── Chat ──────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  difficulty_level?: number
  created_at: string
  isStreaming?: boolean
}

export interface ChatSession {
  id: string
  topic_focus: string | null
  started_at: string
}

export interface SSEMetadata {
  session_id: string
  difficulty: number
  sources: Array<{ chunk_id: string; source: string; score: number }>
  chunk_count: number
}

export interface SSEGraphUpdate {
  highlighted_node_ids: string[]
  nodes: ConceptNode[]
  edges: ConceptEdge[]
}

// ── Progress ──────────────────────────────────────────────────────────────
export interface ProgressStats {
  total_concepts: number
  mastered: number
  in_progress: number
  untouched: number
  average_confidence: number
  total_sessions: number
  total_messages: number
  quiz_accuracy: number
}

// ── Quiz ──────────────────────────────────────────────────────────────────
export interface QuizQuestion {
  concept_id: string
  concept_name: string
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface QuizResult {
  correct: boolean
  explanation: string
  confidence_delta: number
  new_confidence: number
}

// ── Ingestion ─────────────────────────────────────────────────────────────
export interface IngestionJob {
  id: string
  document_name: string
  content_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  chunks_written: number
  nodes_created: number
  edges_created: number
  error_log: string | null
  created_at: string
  completed_at: string | null
}
