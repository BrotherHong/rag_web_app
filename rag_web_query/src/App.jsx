import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './App.css'

import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
import LoginPage from './pages/LoginPage'
import LoginMethodSelectPage from './pages/LoginMethodSelectPage'
import GoogleLoginPage from './pages/GoogleLoginPage'
import SuccessPortalLoginPage from './pages/SuccessPortalLoginPage'
import PortalCallbackPage from './pages/PortalCallbackPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import NotFoundPage from './pages/NotFoundPage'
import DepartmentLayout from './components/DepartmentLayout'
import { useQueryAuth } from './contexts/QueryAuthContext'

function RequireQueryAuth({ children }) {
  const { isAuthenticated, loading } = useQueryAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* 認證路由（獨立於處室系統） */}
        <Route path="/login" element={<LoginMethodSelectPage />} />
        <Route path="/login/normal" element={<LoginPage />} />
        <Route path="/login/google" element={<GoogleLoginPage />} />
        <Route path="/login/success-portal" element={<SuccessPortalLoginPage />} />
        <Route path="/login/portal-callback" element={<PortalCallbackPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        
        {/* 根路徑重定向到預設處室（人事室） */}
        <Route path="/" element={<Navigate to="/hr" replace />} />
        
        {/* 404 頁面 */}
        <Route path="/404" element={<NotFoundPage />} />
        
        {/* 處室動態路由 */}
        <Route path="/:deptSlug" element={<DepartmentLayout />}>
          <Route index element={<HomePage />} />
          <Route
            path="chat"
            element={
              <RequireQueryAuth>
                <ChatPage />
              </RequireQueryAuth>
            }
          />
        </Route>
        
        {/* 其他未匹配路徑重定向到首頁（入口） */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
