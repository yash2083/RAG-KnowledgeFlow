import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RadialBarChart, RadialBar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Trophy, Clock, RefreshCw, BookOpen, Zap, Target } from 'lucide-react'
import api from '@/lib/api'
import type { ProgressStats, ConceptNode } from '@/types'
import { useGraphStore } from '@/stores'

const MASTERY_COLORS = {
  mastered: '#0d9488',
  in_progress: '#d97706',
  review: '#be185d',
  untouched: '#1e3a5f',
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string | number; color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-navy-900 border border-navy-700 rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-2xs uppercase tracking-widest text-slate-500 font-mono">{label}</span>
      </div>
      <p className="font-display text-2xl text-slate-100">{value}</p>
    </motion.div>
  )
}

function FrontierCard({ concept, onSelect }: { concept: ConceptNode; onSelect: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onSelect}
      className="w-full text-left bg-navy-900 border border-navy-700 rounded-xl p-3 hover:border-teal-400/30 hover:bg-teal-400/5 transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 font-medium truncate group-hover:text-teal-300 transition-colors">
            {concept.name}
          </p>
          <p className="text-2xs text-slate-500 mt-0.5 font-mono">{concept.domain}</p>
        </div>
        <span className={`flex-shrink-0 text-2xs font-mono px-2 py-0.5 rounded border diff-${concept.difficulty}`}>
          L{concept.difficulty}
        </span>
      </div>
      {concept.description && (
        <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
          {concept.description}
        </p>
      )}
    </motion.button>
  )
}

export default function ProgressDashboard() {
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [frontier, setFrontier] = useState<ConceptNode[]>([])
  const [loading, setLoading] = useState(true)
  const { setActiveNode, setSidebarOpen } = useGraphStore()

  useEffect(() => {
    Promise.all([
      api.get('/progress/stats'),
      api.get('/graph/frontier'),
    ]).then(([statsRes, frontierRes]) => {
      setStats(statsRes.data)
      setFrontier(frontierRes.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
      </div>
    )
  }

  const pieData = stats
    ? [
        { name: 'Mastered', value: stats.mastered, color: MASTERY_COLORS.mastered },
        { name: 'In Progress', value: stats.in_progress, color: MASTERY_COLORS.in_progress },
        { name: 'Review', value: Math.max(stats.untouched - stats.in_progress - stats.mastered, 0), color: MASTERY_COLORS.review },
        { name: 'Untouched', value: stats.untouched, color: MASTERY_COLORS.untouched },
      ].filter((d) => d.value > 0)
    : []

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Header */}
      <div>
        <h2 className="font-display text-lg text-slate-200">Learning progress</h2>
        <p className="text-xs text-slate-500 mt-0.5">Your knowledge graph at a glance</p>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={Trophy} label="Mastered" value={stats.mastered} color="text-teal-400" />
          <StatCard icon={Clock} label="Sessions" value={stats.total_sessions} color="text-amber-400" />
          <StatCard
            icon={Target}
            label="Quiz accuracy"
            value={`${Math.round(stats.quiz_accuracy * 100)}%`}
            color="text-coral-400"
          />
          <StatCard
            icon={Zap}
            label="Avg confidence"
            value={`${Math.round(stats.average_confidence * 100)}%`}
            color="text-teal-400"
          />
        </div>
      )}

      {/* Mastery pie */}
      {pieData.length > 0 && (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
          <h3 className="text-2xs uppercase tracking-widest text-slate-500 font-mono mb-4">Mastery breakdown</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={100} height={100}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx={45}
                  cy={45}
                  innerRadius={28}
                  outerRadius={45}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0a1120',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-xs text-slate-400">{d.name}</span>
                  <span className="text-xs font-mono text-slate-300 ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confidence bar */}
      {stats && (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-2xs uppercase tracking-widest text-slate-500 font-mono">Overall confidence</span>
            <span className="text-xs font-mono text-teal-400">{Math.round(stats.average_confidence * 100)}%</span>
          </div>
          <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.average_confidence * 100}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-teal-400/60 to-teal-400 rounded-full"
            />
          </div>
        </div>
      )}

      {/* Frontier concepts */}
      {frontier.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-amber-400" />
            <h3 className="text-2xs uppercase tracking-widest text-slate-500 font-mono">Ready to learn</h3>
          </div>
          <div className="space-y-2">
            {frontier.slice(0, 5).map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <FrontierCard
                  concept={c}
                  onSelect={() => {
                    setActiveNode(c.id)
                    setSidebarOpen(true)
                  }}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
