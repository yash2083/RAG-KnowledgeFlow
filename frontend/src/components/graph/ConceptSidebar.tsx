import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, CheckCircle, Clock, RefreshCw, Trophy, ChevronRight } from 'lucide-react'
import { useGraphStore } from '@/stores'
import api from '@/lib/api'
import type { ConceptNode, QuizQuestion, QuizResult } from '@/types'

const MASTERY_CONFIG = {
  untouched: { label: 'Not started', icon: BookOpen, color: 'text-slate-400', bg: 'bg-navy-700' },
  in_progress: { label: 'In progress', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  mastered: { label: 'Mastered', icon: Trophy, color: 'text-teal-400', bg: 'bg-teal-400/10' },
  review: { label: 'Needs review', icon: RefreshCw, color: 'text-coral-400', bg: 'bg-coral-400/10' },
}

const DIFF_LABELS = ['', 'Foundational', 'Beginner', 'Intermediate', 'Advanced', 'Expert']

export default function ConceptSidebar() {
  const { nodes, activeNodeId, sidebarOpen, setSidebarOpen, setActiveNode } = useGraphStore()
  const [quiz, setQuiz] = useState<QuizQuestion | null>(null)
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [loadingQuiz, setLoadingQuiz] = useState(false)

  const concept = nodes.find((n) => n.id === activeNodeId) ?? null

  useEffect(() => {
    setQuiz(null)
    setQuizResult(null)
    setSelectedOption(null)
  }, [activeNodeId])

  const loadQuiz = async () => {
    if (!concept) return
    setLoadingQuiz(true)
    try {
      const res = await api.get(`/progress/quiz/${concept.id}`)
      setQuiz(res.data)
    } catch {}
    setLoadingQuiz(false)
  }

  const submitAnswer = async (idx: number) => {
    if (!quiz || quizResult) return
    setSelectedOption(idx)
    try {
      const res = await api.post('/progress/quiz/submit', {
        concept_id: quiz.concept_id,
        question_text: quiz.question,
        selected_index: idx,
        correct_index: quiz.correct_index,
      })
      setQuizResult(res.data)
    } catch {}
  }

  const markMastery = async (state: string, confidence: number) => {
    if (!concept) return
    try {
      await api.post('/graph/mastery', {
        concept_id: concept.id,
        state,
        confidence,
      })
    } catch {}
  }

  const mastery = concept ? MASTERY_CONFIG[concept.mastery_state] ?? MASTERY_CONFIG.untouched : null

  return (
    <AnimatePresence>
      {sidebarOpen && concept && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute right-0 top-0 h-full w-80 bg-navy-900 border-l border-navy-700 z-20 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-navy-700">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-2xs uppercase tracking-widest text-slate-500 mb-1 font-mono">
                {concept.domain}
              </p>
              <h3 className="font-display text-lg text-slate-100 leading-tight">
                {concept.name}
              </h3>
            </div>
            <button
              onClick={() => { setSidebarOpen(false); setActiveNode(null) }}
              className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Mastery status */}
            <div className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ${mastery?.bg}`}>
              {mastery && <mastery.icon size={15} className={mastery.color} />}
              <span className={`text-sm font-medium ${mastery?.color}`}>{mastery?.label}</span>
              <div className="ml-auto flex items-center gap-1">
                <div className="h-1.5 w-20 bg-navy-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-400 rounded-full transition-all"
                    style={{ width: `${(concept.mastery_confidence ?? 0) * 100}%` }}
                  />
                </div>
                <span className="text-2xs text-slate-500 font-mono w-8 text-right">
                  {Math.round((concept.mastery_confidence ?? 0) * 100)}%
                </span>
              </div>
            </div>

            {/* Difficulty badge */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono diff-${concept.difficulty}`}>
                {DIFF_LABELS[concept.difficulty] ?? `Level ${concept.difficulty}`}
              </span>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-2xs uppercase tracking-widest text-slate-500 font-mono mb-2">About</h4>
              <p className="text-sm text-slate-300 leading-relaxed">{concept.description}</p>
            </div>

            {/* Mastery actions */}
            <div>
              <h4 className="text-2xs uppercase tracking-widest text-slate-500 font-mono mb-2">Mark as</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { state: 'mastered', conf: 0.9, label: 'Mastered', cls: 'border-teal-400/30 text-teal-400 hover:bg-teal-400/10' },
                  { state: 'in_progress', conf: 0.5, label: 'In progress', cls: 'border-amber-400/30 text-amber-400 hover:bg-amber-400/10' },
                  { state: 'review', conf: 0.2, label: 'Review', cls: 'border-coral-400/30 text-coral-400 hover:bg-coral-400/10' },
                  { state: 'untouched', conf: 0.0, label: 'Reset', cls: 'border-slate-600 text-slate-400 hover:bg-slate-700' },
                ].map((opt) => (
                  <button
                    key={opt.state}
                    onClick={() => markMastery(opt.state, opt.conf)}
                    className={`text-xs font-medium px-2.5 py-2 rounded border transition-colors ${opt.cls}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quiz section */}
            <div className="border-t border-navy-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-2xs uppercase tracking-widest text-slate-500 font-mono">Quiz</h4>
                {!quiz && (
                  <button
                    onClick={loadQuiz}
                    disabled={loadingQuiz}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
                  >
                    {loadingQuiz ? 'Loading…' : 'Generate question'} <ChevronRight size={12} />
                  </button>
                )}
              </div>

              {quiz && (
                <div className="space-y-3 animate-fade-in">
                  <p className="text-sm text-slate-200 leading-relaxed">{quiz.question}</p>
                  <div className="space-y-2">
                    {quiz.options.map((opt, i) => {
                      const isSelected = selectedOption === i
                      const isCorrect = quizResult && i === quiz.correct_index
                      const isWrong = quizResult && isSelected && !quizResult.correct
                      return (
                        <button
                          key={i}
                          onClick={() => submitAnswer(i)}
                          disabled={!!quizResult}
                          className={[
                            'w-full text-left text-xs px-3 py-2.5 rounded border transition-all',
                            isCorrect
                              ? 'border-teal-400 bg-teal-400/10 text-teal-300'
                              : isWrong
                              ? 'border-coral-400 bg-coral-400/10 text-coral-300'
                              : isSelected
                              ? 'border-teal-400/50 bg-navy-800 text-slate-200'
                              : 'border-navy-600 bg-navy-800 text-slate-300 hover:border-navy-500',
                          ].join(' ')}
                        >
                          <span className="font-mono text-slate-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                  {quizResult && (
                    <div className={`text-xs p-2.5 rounded border ${quizResult.correct ? 'border-teal-400/20 bg-teal-400/5 text-teal-300' : 'border-coral-400/20 bg-coral-400/5 text-coral-300'}`}>
                      {quizResult.correct ? '✓ Correct! ' : '✗ Not quite. '}
                      Confidence {quizResult.confidence_delta >= 0 ? '+' : ''}
                      {Math.round(quizResult.confidence_delta * 100)}%
                    </div>
                  )}
                  {quizResult && (
                    <button
                      onClick={() => { setQuiz(null); setQuizResult(null); setSelectedOption(null) }}
                      className="text-xs text-slate-500 hover:text-slate-400"
                    >
                      Try another question →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
