import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/stores'
import AuthPage from '@/components/layout/AuthPage'
import LearnPage from '@/components/layout/LearnPage'
import AdminPanel from '@/components/admin/AdminPanel'

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

// Helper to auto login since backend auth is bypassed
function useAutoLogin() {
  const { user, setAuth } = useAuthStore()
  
  useEffect(() => {
    if (!user) {
      setAuth({
        id: "mock-bypass-user-id",
        email: "admin@example.com",
        full_name: "Auto Admin",
        is_admin: true,
        preferred_difficulty: 3,
        created_at: new Date().toISOString()
      }, "mock-bypass-token")
    }
  }, [user, setAuth])
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  useAutoLogin()
  return user ? <>{children}</> : null
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  useAutoLogin()
  if (!user) return null
  if (!user.is_admin) return <Navigate to="/learn" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/learn" element={<RequireAuth><LearnPage /></RequireAuth>} />
          <Route path="/graph" element={<RequireAuth><LearnPage /></RequireAuth>} />
          <Route path="/progress" element={<RequireAuth><LearnPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminPanel /></RequireAdmin>} />
          <Route path="/" element={<Navigate to="/learn" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0f1c35',
            border: '1px solid #1e3a5f',
            color: '#cbd5e1',
            fontSize: '13px',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#2dd4bf', secondary: '#0f1c35' } },
          error: { iconTheme: { primary: '#fb7185', secondary: '#0f1c35' } },
        }}
      />
    </QueryClientProvider>
  )
}
