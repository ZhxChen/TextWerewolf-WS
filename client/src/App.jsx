import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Cursor } from 'animal-island-ui'
import { ToastProvider } from './components/Toast'
import { useAuthStore } from './stores/useAuthStore'
import './App.css'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const LobbyPage = lazy(() => import('./pages/LobbyPage'))
const RoomPage = lazy(() => import('./pages/RoomPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Cursor>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={(
                  <PrivateRoute>
                    <LobbyPage />
                  </PrivateRoute>
                )}
              />
              <Route
                path="/room/:roomId"
                element={(
                  <PrivateRoute>
                    <RoomPage />
                  </PrivateRoute>
                )}
              />
              <Route
                path="/admin"
                element={(
                  <AdminRoute>
                    <AdminPage />
                  </AdminRoute>
                )}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </Cursor>
  )
}
