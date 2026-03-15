import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Settings, LogOut, User, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useGraphStore } from '@/stores'
import api from '@/lib/api'
import type { ConceptNode } from '@/types'

export default function TopNav() {
  const { user, logout } = useAuthStore()
  const { setActiveNode, setSidebarOpen, mergeGraphUpdate } = useGraphStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ConceptNode[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)

  // Debounce search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/graph/search', { params: { q: searchQuery } })
        setSearchResults(res.data.slice(0, 6))
      } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false)
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectConcept = async (concept: ConceptNode) => {
    setSearchQuery('')
    setShowSearch(false)
    setActiveNode(concept.id)
    setSidebarOpen(true)
    // Load neighborhood
    try {
      const res = await api.get(`/graph/neighborhood/${concept.id}`)
      mergeGraphUpdate(res.data.nodes, res.data.edges)
    } catch {}
  }

  return (
    <header className="h-12 bg-navy-950 border-b border-navy-800 flex items-center px-4 gap-4 flex-shrink-0 z-30">
      {/* Logo */}
      <Link to="/learn" className="flex items-center gap-2 flex-shrink-0 group">
        <div className="w-7 h-7 rounded-lg bg-teal-400/10 border border-teal-400/20 flex items-center justify-center group-hover:border-teal-400/40 transition-colors">
          <span className="text-teal-400 text-sm font-mono font-medium">K</span>
        </div>
        <span className="font-display text-sm text-slate-200 hidden sm:block">KnowledgeFlow</span>
      </Link>

      {/* Search */}
      <div ref={searchRef} className="flex-1 max-w-md relative">
        <div className="flex items-center gap-2 bg-navy-900 border border-navy-700 rounded-lg px-3 h-8 focus-within:border-teal-400/40 transition-colors">
          <Search size={13} className="text-slate-500 flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true) }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search concepts…"
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
          />
          <kbd className="hidden sm:block text-2xs font-mono text-slate-600 bg-navy-800 px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>

        <AnimatePresence>
          {showSearch && searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute top-10 left-0 right-0 bg-navy-900 border border-navy-700 rounded-xl overflow-hidden shadow-card z-50"
            >
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConcept(c)}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-navy-800 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{c.name}</p>
                    <p className="text-2xs text-slate-500 font-mono">{c.domain}</p>
                  </div>
                  <span className={`text-2xs font-mono px-1.5 py-0.5 rounded border diff-${c.difficulty}`}>
                    L{c.difficulty}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-1">
        {[
          { to: '/learn', label: 'Learn' },
          { to: '/graph', label: 'Graph' },
          { to: '/progress', label: 'Progress' },
          ...(user?.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
        ].map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-navy-800 transition-all"
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="ml-auto relative">
        <button
          onClick={() => setShowUserMenu((v) => !v)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-teal-400/15 border border-teal-400/20 flex items-center justify-center">
            <span className="text-xs text-teal-400 font-medium">
              {user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
        </button>

        <AnimatePresence>
          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              className="absolute right-0 top-10 w-52 bg-navy-900 border border-navy-700 rounded-xl overflow-hidden shadow-card z-50"
            >
              <div className="px-4 py-3 border-b border-navy-700">
                <p className="text-sm text-slate-200 font-medium truncate">{user?.full_name ?? 'Learner'}</p>
                <p className="text-2xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => navigate('/settings')}
                  className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-navy-800 transition-colors"
                >
                  <Settings size={14} /> Settings
                </button>
                {user?.is_admin && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-navy-800 transition-colors"
                  >
                    <Shield size={14} /> Admin panel
                  </button>
                )}
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-coral-400 hover:text-coral-300 hover:bg-navy-800 transition-colors"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
