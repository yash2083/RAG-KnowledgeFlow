import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Plus, CheckCircle, XCircle, Loader2, Database, Network, FileText } from 'lucide-react'
import api from '@/lib/api'
import TopNav from '@/components/layout/TopNav'
import type { IngestionJob } from '@/types'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  pending: { icon: Loader2, color: 'text-amber-400', label: 'Pending', animate: false },
  processing: { icon: Loader2, color: 'text-teal-400', label: 'Processing', animate: true },
  completed: { icon: CheckCircle, color: 'text-teal-400', label: 'Completed', animate: false },
  failed: { icon: XCircle, color: 'text-coral-400', label: 'Failed', animate: false },
}

function JobRow({ job }: { job: IngestionJob }) {
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending
  return (
    <div className="flex items-center gap-4 py-3 border-b border-navy-800 last:border-0">
      <cfg.icon
        size={14}
        className={`${cfg.color} flex-shrink-0 ${cfg.animate ? 'animate-spin' : ''}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{job.document_name}</p>
        <p className="text-2xs text-slate-500 font-mono mt-0.5">
          {job.content_type} · {new Date(job.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-2xs font-mono text-slate-500">
        <span title="Chunks">{job.chunks_written}ch</span>
        <span title="Nodes">{job.nodes_created}n</span>
        <span title="Edges">{job.edges_created}e</span>
      </div>
      <span className={`text-2xs font-medium ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}

export default function AdminPanel() {
  const [jobs, setJobs] = useState<IngestionJob[]>([])
  const [uploading, setUploading] = useState(false)
  const [textContent, setTextContent] = useState('')
  const [docName, setDocName] = useState('')
  const [domain, setDomain] = useState('general')
  const [difficulty, setDifficulty] = useState(3)
  const [activeTab, setActiveTab] = useState<'upload' | 'text' | 'jobs'>('upload')
  const fileRef = useRef<HTMLInputElement>(null)
  const [stats, setStats] = useState({ collections: 0, nodes: 0 })

  const loadJobs = () => {
    api.get('/ingestion/jobs').then((r) => setJobs(r.data)).catch(() => {})
  }

  useEffect(() => {
    loadJobs()
    const t = setInterval(loadJobs, 5000)
    return () => clearInterval(t)
  }, [])

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('domain', domain)
    form.append('difficulty', String(difficulty))
    try {
      await api.post('/ingestion/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(`Ingesting "${file.name}"`)
      loadJobs()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const ingestText = async () => {
    if (!textContent.trim() || !docName.trim()) return
    setUploading(true)
    const form = new FormData()
    form.append('content', textContent)
    form.append('document_name', docName)
    form.append('domain', domain)
    form.append('difficulty', String(difficulty))
    try {
      await api.post('/ingestion/text', form)
      toast.success(`Ingesting "${docName}"`)
      setTextContent('')
      setDocName('')
      loadJobs()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Ingestion failed')
    } finally {
      setUploading(false)
    }
  }

  const TABS = [
    { id: 'upload' as const, icon: Upload, label: 'File upload' },
    { id: 'text' as const, icon: FileText, label: 'Raw text' },
    { id: 'jobs' as const, icon: Database, label: `Jobs (${jobs.length})` },
  ]

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      <TopNav />
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Network size={18} className="text-teal-400" />
            <h1 className="font-display text-xl text-slate-100">Admin panel</h1>
          </div>
          <p className="text-sm text-slate-500">Ingest content and manage the knowledge graph</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total jobs', value: jobs.length },
            { label: 'Completed', value: jobs.filter((j) => j.status === 'completed').length },
            { label: 'Total chunks', value: jobs.reduce((a, j) => a + j.chunks_written, 0) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-navy-900 border border-navy-700 rounded-xl p-4">
              <p className="text-2xs uppercase tracking-widest text-slate-500 font-mono mb-1">{label}</p>
              <p className="font-display text-2xl text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-6">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg transition-all',
                activeTab === id
                  ? 'bg-navy-800 text-teal-400 border border-navy-600'
                  : 'text-slate-500 hover:text-slate-400',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Common fields */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-2xs font-mono uppercase tracking-wide text-slate-500 mb-1.5">Domain</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. machine-learning"
              className="w-full bg-navy-900 border border-navy-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/40"
            />
          </div>
          <div>
            <label className="block text-2xs font-mono uppercase tracking-wide text-slate-500 mb-1.5">
              Difficulty (1–5)
            </label>
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={[
                    'w-9 h-9 rounded-lg text-sm font-mono transition-all border',
                    d === difficulty
                      ? 'bg-teal-400/20 text-teal-400 border-teal-400/40'
                      : 'bg-navy-900 text-slate-500 border-navy-700 hover:border-navy-600',
                  ].join(' ')}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <label className={[
                'flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all',
                uploading
                  ? 'border-teal-400/40 bg-teal-400/5'
                  : 'border-navy-700 hover:border-teal-400/30 hover:bg-teal-400/5',
              ].join(' ')}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.md,.txt"
                  onChange={uploadFile}
                  className="hidden"
                  disabled={uploading}
                />
                {uploading ? (
                  <Loader2 size={24} className="text-teal-400 animate-spin mb-3" />
                ) : (
                  <Upload size={24} className="text-slate-500 mb-3" />
                )}
                <p className="text-sm text-slate-400">
                  {uploading ? 'Uploading and ingesting…' : 'Drop a file or click to browse'}
                </p>
                <p className="text-2xs text-slate-600 mt-1">PDF, DOCX, Markdown, TXT</p>
              </label>
            </motion.div>
          )}

          {activeTab === 'text' && (
            <motion.div
              key="text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-2xs font-mono uppercase tracking-wide text-slate-500 mb-1.5">Document name</label>
                <input
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Introduction to Neural Networks"
                  className="w-full bg-navy-900 border border-navy-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/40"
                />
              </div>
              <div>
                <label className="block text-2xs font-mono uppercase tracking-wide text-slate-500 mb-1.5">Content</label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={10}
                  placeholder="Paste your educational content here…"
                  className="w-full bg-navy-900 border border-navy-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/40 resize-none font-mono"
                />
              </div>
              <button
                onClick={ingestText}
                disabled={uploading || !textContent.trim() || !docName.trim()}
                className="flex items-center gap-2 bg-teal-400/15 hover:bg-teal-400/25 border border-teal-400/30 text-teal-400 text-sm font-medium px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Ingest text
              </button>
            </motion.div>
          )}

          {activeTab === 'jobs' && (
            <motion.div
              key="jobs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-navy-900 border border-navy-700 rounded-xl p-4"
            >
              {jobs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No ingestion jobs yet</p>
              ) : (
                <div>
                  {jobs.map((j) => <JobRow key={j.id} job={j} />)}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
