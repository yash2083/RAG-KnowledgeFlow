import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/stores'
import api from '@/lib/api'

type Mode = 'login' | 'register'

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const payload = mode === 'login'
        ? { email, password }
        : { email, password, full_name: name }
      const res = await api.post(endpoint, payload)
      setAuth(res.data.user, res.data.access_token)
      navigate('/learn')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4 bg-grid-navy bg-grid">
      {/* Glow */}
      <div className="fixed inset-0 bg-glow-teal opacity-40 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-400/10 border border-teal-400/20 mb-4 shadow-teal-glow">
            <span className="font-display text-2xl text-teal-400">K</span>
          </div>
          <h1 className="font-display text-2xl text-slate-100">KnowledgeFlow</h1>
          <p className="text-sm text-slate-500 mt-1">Adaptive learning, powered by knowledge graphs</p>
        </div>

        {/* Card */}
        <div className="bg-navy-900 border border-navy-700 rounded-2xl p-6 shadow-card">
          {/* Mode toggle */}
          <div className="flex bg-navy-950 rounded-xl p-0.5 mb-6">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={[
                  'flex-1 py-2 text-sm rounded-lg transition-all',
                  mode === m
                    ? 'bg-navy-800 text-slate-200 shadow-card'
                    : 'text-slate-500 hover:text-slate-400',
                ].join(' ')}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-xs text-slate-500 mb-1.5 font-mono uppercase tracking-wide">
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className="w-full bg-navy-950 border border-navy-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/40 transition-colors"
                />
              </motion.div>
            )}

            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-mono uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-navy-950 border border-navy-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/40 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-mono uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full bg-navy-950 border border-navy-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/40 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-coral-400 text-xs bg-coral-400/10 border border-coral-400/20 rounded-lg px-3 py-2"
              >
                <AlertCircle size={13} />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-400/15 hover:bg-teal-400/25 border border-teal-400/30 text-teal-400 text-sm font-medium py-2.5 rounded-xl transition-all shadow-teal-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-2xs text-slate-600 mt-6">
          KnowledgeFlow — adaptive learning platform
        </p>
      </motion.div>
    </div>
  )
}
