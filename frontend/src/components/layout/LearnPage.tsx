import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Network, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react'
import ChatPanel from '@/components/chat/ChatPanel'
import GraphCanvas from '@/components/graph/GraphCanvas'
import ConceptSidebar from '@/components/graph/ConceptSidebar'
import ProgressDashboard from '@/components/dashboard/ProgressDashboard'
import TopNav from '@/components/layout/TopNav'
import api from '@/lib/api'
import { useAuthStore, useGraphStore } from '@/stores'

type Panel = 'chat' | 'graph' | 'progress'

const TABS: { id: Panel; icon: any; label: string }[] = [
  { id: 'chat', icon: MessageSquare, label: 'Learn' },
  { id: 'graph', icon: Network, label: 'Graph' },
  { id: 'progress', icon: BarChart2, label: 'Progress' },
]

export default function LearnPage() {
  const [activePanel, setActivePanel] = useState<Panel>('chat')
  const [graphPanelCollapsed, setGraphPanelCollapsed] = useState(false)
  const { user } = useAuthStore()
  const { setGraph, sidebarOpen } = useGraphStore()

  // Load initial graph data on mount
  useEffect(() => {
    api.get('/graph/concepts').then((res) => {
      const nodes = res.data.slice(0, 50) // Initial load: first 50 concepts
      setGraph(nodes, [])
      // Also fetch some edges by loading neighborhoods
    }).catch(() => {})
  }, [])

  return (
    <div className="h-screen flex flex-col bg-navy-950 overflow-hidden">
      <TopNav />

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-navy-800 bg-navy-950 flex-shrink-0">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={[
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-2xs transition-colors',
              activePanel === id ? 'text-teal-400' : 'text-slate-500',
            ].join(' ')}
          >
            <Icon size={16} />
            {label}
            {activePanel === id && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 w-8 h-0.5 bg-teal-400 rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* Desktop three-panel layout */}
      <div className="flex-1 hidden md:flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-[400px] flex-shrink-0 border-r border-navy-800 flex flex-col">
          <ChatPanel className="flex-1" />
        </div>

        {/* Center: Graph */}
        <div
          className={[
            'relative flex-1 transition-all duration-300 border-r border-navy-800',
            graphPanelCollapsed ? 'w-0 overflow-hidden flex-none' : '',
          ].join(' ')}
        >
          {/* Graph toolbar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <div className="flex items-center gap-1 bg-navy-900/90 border border-navy-700 rounded-lg px-3 py-1.5 backdrop-blur-sm">
              <Network size={13} className="text-teal-400" />
              <span className="text-xs text-slate-400 font-mono">Knowledge graph</span>
            </div>
          </div>

          {/* Graph legend */}
          <div className="absolute bottom-3 left-3 z-10">
            <div className="bg-navy-900/90 border border-navy-700 rounded-lg px-3 py-2.5 backdrop-blur-sm space-y-1.5">
              {[
                { color: '#0d9488', label: 'Mastered' },
                { color: '#d97706', label: 'In progress' },
                { color: '#be185d', label: 'Review' },
                { color: '#1e3a5f', label: 'Untouched' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                  <span className="text-2xs text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <GraphCanvas className="w-full h-full" />
          <ConceptSidebar />
        </div>

        {/* Right: Progress */}
        <div className="w-72 flex-shrink-0 overflow-hidden">
          <ProgressDashboard />
        </div>
      </div>

      {/* Mobile single-panel view */}
      <div className="flex-1 md:hidden overflow-hidden relative">
        {activePanel === 'chat' && <ChatPanel className="h-full" />}
        {activePanel === 'graph' && (
          <div className="h-full relative">
            <GraphCanvas className="w-full h-full" />
            <ConceptSidebar />
          </div>
        )}
        {activePanel === 'progress' && <ProgressDashboard />}
      </div>
    </div>
  )
}
