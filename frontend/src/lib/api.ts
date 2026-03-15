import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kf_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('kf_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── SSE streaming helper ──────────────────────────────────────────────────
export function createChatStream(
  message: string,
  sessionId: string | null,
  difficulty?: number,
  conceptFilter?: string | null,
  onToken?: (token: string) => void,
  onMetadata?: (data: any) => void,
  onGraphUpdate?: (data: any) => void,
  onDone?: (data: any) => void,
  onError?: (err: string) => void
): () => void {
  const token = localStorage.getItem('kf_token')

  // Use fetch for SSE with POST body
  const controller = new AbortController()

  fetch('/api/v1/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      difficulty_override: difficulty,
      concept_filter: conceptFilter,
    }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onError?.(`HTTP ${res.status}`)
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const payload = JSON.parse(line.slice(6))
          switch (payload.type) {
            case 'token':
              onToken?.(payload.content)
              break
            case 'metadata':
              onMetadata?.(payload)
              break
            case 'graph_update':
              onGraphUpdate?.(payload)
              break
            case 'done':
              onDone?.(payload)
              break
            case 'error':
              onError?.(payload.message)
              break
          }
        } catch {}
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') onError?.(String(err))
  })

  return () => controller.abort()
}
