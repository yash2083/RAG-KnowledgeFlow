import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, ConceptNode, ConceptEdge, ChatMessage, ChatSession, SSEMetadata } from '@/types'

// ── Auth Store ────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('kf_token', token)
        set({ user, token })
      },
      logout: () => {
        localStorage.removeItem('kf_token')
        set({ user: null, token: null })
      },
    }),
    { name: 'kf_auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)

// ── Graph Store ───────────────────────────────────────────────────────────
interface GraphState {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  activeNodeId: string | null
  highlightedNodeIds: string[]
  centerNodeId: string | null
  sidebarOpen: boolean
  setGraph: (nodes: ConceptNode[], edges: ConceptEdge[]) => void
  mergeGraphUpdate: (nodes: ConceptNode[], edges: ConceptEdge[]) => void
  setActiveNode: (id: string | null) => void
  setHighlighted: (ids: string[]) => void
  setCenterNode: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  activeNodeId: null,
  highlightedNodeIds: [],
  centerNodeId: null,
  sidebarOpen: false,

  setGraph: (nodes, edges) => set({ nodes, edges }),

  mergeGraphUpdate: (newNodes, newEdges) => {
    const existing = get()
    const nodeMap = new Map(existing.nodes.map((n) => [n.id, n]))
    newNodes.forEach((n) => nodeMap.set(n.id, n))

    const edgeKey = (e: ConceptEdge) => `${e.source}--${e.target}--${e.relationship}`
    const edgeMap = new Map(existing.edges.map((e) => [edgeKey(e), e]))
    newEdges.forEach((e) => edgeMap.set(edgeKey(e), e))

    set({
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
    })
  },

  setActiveNode: (id) => set({ activeNodeId: id, sidebarOpen: id !== null }),
  setHighlighted: (ids) => set({ highlightedNodeIds: ids }),
  setCenterNode: (id) => set({ centerNodeId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))

// ── Chat Store ────────────────────────────────────────────────────────────
interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  lastMetadata: SSEMetadata | null
  difficulty: number

  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  appendStreamToken: (token: string) => void
  finalizeStream: (finalContent: string, messageId: string) => void
  setIsStreaming: (v: boolean) => void
  setLastMetadata: (m: SSEMetadata | null) => void
  setDifficulty: (v: number) => void
  clearChat: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  lastMetadata: null,
  difficulty: 3,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  appendStreamToken: (token) =>
    set((s) => ({ streamingContent: s.streamingContent + token })),

  finalizeStream: (finalContent, messageId) => {
    const assistantMsg: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: finalContent,
      created_at: new Date().toISOString(),
      isStreaming: false,
    }
    set((s) => ({
      messages: [...s.messages, assistantMsg],
      isStreaming: false,
      streamingContent: '',
    }))
  },

  setIsStreaming: (v) => set({ isStreaming: v }),
  setLastMetadata: (m) => set({ lastMetadata: m }),
  setDifficulty: (v) => set({ difficulty: v }),
  clearChat: () => set({ messages: [], activeSessionId: null, streamingContent: '' }),
}))
