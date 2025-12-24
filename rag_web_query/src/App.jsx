import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
import NotFoundPage from './pages/NotFoundPage'
import DepartmentLayout from './components/DepartmentLayout'

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* 根路徑重定向到預設處室（人事室） */}
        <Route path="/" element={<Navigate to="/hr" replace />} />
        
        {/* 404 頁面 */}
        <Route path="/404" element={<NotFoundPage />} />
        
        {/* 處室動態路由 */}
        <Route path="/:deptSlug" element={<DepartmentLayout />}>
          <Route index element={<HomePage />} />
          <Route path="chat" element={<ChatPage />} />
        </Route>
        
        {/* 其他未匹配路徑重定向到首頁（入口） */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
