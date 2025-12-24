import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, BrowserRouter } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 檢查本地存儲的登入狀態和角色
  useEffect(() => {
    const checkAuth = () => {
      const authStatus = localStorage.getItem('isAuthenticated');
      const userStr = localStorage.getItem('user');
      
      setIsAuthenticated(authStatus === 'true');
      
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          setUserRole(user.role);
        } catch {
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
    };

    checkAuth();
    setIsLoading(false);

    // 監聽 storage 事件以處理跨標籤頁登出
    window.addEventListener('storage', checkAuth);

    // 自定義事件監聽器以處理同標籤頁登出
    const handleAuthChange = () => {
      checkAuth();
    };
    window.addEventListener('authChange', handleAuthChange);

    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('authChange', handleAuthChange);
    };
  }, []);

  const handleLogin = (status, role) => {
    setIsAuthenticated(status);
    setUserRole(role);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? (
              // 根據使用者角色導向不同的管理頁面
              userRole === 'SUPER_ADMIN' ? (
                <Navigate to="/super-admin" replace />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Login onLogin={handleLogin} />
            )
          } 
        />
        <Route 
          path="/super-admin" 
          element={
            isAuthenticated && userRole === 'SUPER_ADMIN' ? (
              <SuperAdminDashboard />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            isAuthenticated && userRole !== 'SUPER_ADMIN' ? (
              <Dashboard />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
