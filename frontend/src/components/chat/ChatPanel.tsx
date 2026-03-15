import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Loader2, ChevronDown, ChevronUp, Sliders, BookOpen } from 'lucide-react'
import { useChatStore, useAuthStore, useGraphStore } from '@/stores'
import { createChatStream } from '@/lib/api'
import api from '@/lib/api'

const DIFF_LABELS: Record<number, string> = {
  1: 'Foundational', 2: 'Beginner', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert'
}

function DifficultyPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Sliders size={12} className="text-slate-500" />
      {[1, 2, 3, 4, 5].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          title={DIFF_LABELS[d]}
          className={[
            'w-5 h-5 rounded text-2xs font-mono transition-all',
            d <= value
              ? 'bg-teal-400/20 text-teal-400 border border-teal-400/30'
              : 'bg-navy-800 text-slate-600 border border-navy-700 hover:border-navy-600',
          ].join(' ')}
        >
          {d}
        </button>
      ))}
      <span className="text-2xs text-slate-500 ml-1">{DIFF_LABELS[value]}</span>
    </div>
  )
}

function SourcesPanel({ sources }: { sources: Array<{ chunk_id: string; source: string; score: number }> }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-2xs text-slate-500 hover:text-slate-400 transition-colors"
      >
        <BookOpen size={11} />
        {sources.length} source{sources.length !== 1 ? 's' : ''} retrieved
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1 pl-2 border-l border-navy-700">
              {sources.map((s) => (
                <div key={s.chunk_id} className="flex items-center justify-between">
                  <span className="text-2xs text-slate-500 font-mono truncate max-w-[200px]">
                    {s.source || s.chunk_id.slice(0, 16) + '…'}
                  </span>
                  <span className="text-2xs text-teal-400/60 font-mono ml-2">
                    {Math.round(s.score * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  difficulty?: number
  sources?: Array<{ chunk_id: string; source: string; score: number }>
}

function MessageBubble({ role, content, isStreaming, difficulty, sources }: MessageBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {role === 'user' ? (
        <div className="max-w-[85%] bg-navy-700 border border-navy-600 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-sm text-slate-200 leading-relaxed">{content}</p>
        </div>
      ) : (
        <div className="max-w-[92%] flex flex-col">
          {difficulty && (
            <span className={`self-start mb-2 text-2xs font-mono px-2 py-0.5 rounded border diff-${difficulty}`}>
              {DIFF_LABELS[difficulty]}
            </span>
          )}
          <div className={`prose-kf text-sm ${isStreaming ? 'streaming-cursor' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
          {sources && sources.length > 0 && <SourcesPanel sources={sources} />}
        </div>
      )}
    </motion.div>
  )
}

interface ChatPanelProps {
  className?: string
}

export default function ChatPanel({ className = '' }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const { user } = useAuthStore()

  const {
    messages, isStreaming, streamingContent, difficulty, lastMetadata,
    addMessage, appendStreamToken, finalizeStream, setIsStreaming,
    setLastMetadata, setDifficulty, activeSessionId, setActiveSession,
  } = useChatStore()

  const { mergeGraphUpdate, setHighlighted } = useGraphStore()

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [input])

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    setInput('')
    const userMsgId = crypto.randomUUID()
    addMessage({ id: userMsgId, role: 'user', content: trimmed, created_at: new Date().toISOString() })
    setIsStreaming(true)
    setLastMetadata(null)

    let accum = ''
    let currentSources: any[] = []

    const stop = createChatStream(
      trimmed,
      activeSessionId,
      difficulty,
      null,
      (token) => {
        accum += token
        appendStreamToken(token)
      },
      (meta) => {
        setLastMetadata(meta)
        currentSources = meta.sources || []
        if (meta.session_id && !activeSessionId) {
          setActiveSession(meta.session_id)
        }
      },
      (graphUpdate) => {
        if (graphUpdate.nodes?.length) {
          mergeGraphUpdate(graphUpdate.nodes, graphUpdate.edges || [])
        }
        if (graphUpdate.highlighted_node_ids?.length) {
          setHighlighted(graphUpdate.highlighted_node_ids)
        }
      },
      (done) => {
        finalizeStream(accum, done.message_id || crypto.randomUUID())
      },
      (err) => {
        finalizeStream(`*Error: ${err}*`, crypto.randomUUID())
      }
    )
    stopRef.current = stop
  }, [input, isStreaming, difficulty, activeSessionId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleStop = () => {
    stopRef.current?.()
    finalizeStream(streamingContent, crypto.randomUUID())
  }

  const isEmpty = messages.length === 0 && !streamingContent

  return (
    <div className={`flex flex-col h-full bg-navy-950 ${className}`}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center py-16"
          >
            <div className="w-12 h-12 rounded-2xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center mb-4">
              <span className="text-2xl">⬡</span>
            </div>
            <h2 className="font-display text-xl text-slate-300 mb-2">What do you want to learn?</h2>
            <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
              Ask anything. Your knowledge graph grows with every conversation.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
              {[
                'Explain transformer attention mechanisms',
                'What is gradient descent?',
                'How does backpropagation work?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q) }}
                  className="text-left text-xs text-slate-400 border border-navy-700 rounded-xl px-4 py-3 hover:border-teal-400/30 hover:text-slate-300 hover:bg-teal-400/5 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            difficulty={msg.difficulty_level}
            sources={lastMetadata?.sources}
          />
        ))}

        {/* Streaming response */}
        {isStreaming && streamingContent && (
          <MessageBubble
            role="assistant"
            content={streamingContent}
            isStreaming={true}
            difficulty={difficulty}
          />
        )}

        {/* Loading indicator (before first token) */}
        {isStreaming && !streamingContent && (
          <div className="flex items-center gap-2 text-slate-500">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-teal-400/60"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
            <span className="text-xs">Retrieving…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-navy-800 p-4 space-y-3">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-navy-900 border border-navy-700 rounded-xl overflow-hidden focus-within:border-teal-400/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={1}
              className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-600 px-4 py-3 resize-none outline-none leading-relaxed"
              disabled={isStreaming}
            />
          </div>
          <button
            onClick={isStreaming ? handleStop : sendMessage}
            disabled={!input.trim() && !isStreaming}
            className={[
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all',
              isStreaming
                ? 'bg-coral-400/20 border border-coral-400/30 text-coral-400 hover:bg-coral-400/30'
                : input.trim()
                ? 'bg-teal-400/20 border border-teal-400/30 text-teal-400 hover:bg-teal-400/30 shadow-teal-glow'
                : 'bg-navy-800 border border-navy-700 text-slate-600 cursor-not-allowed',
            ].join(' ')}
          >
            {isStreaming
              ? <span className="w-3 h-3 rounded-sm bg-coral-400/80" />
              : <Send size={15} />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
