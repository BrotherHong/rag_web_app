import { useState } from 'react';
import { login } from '../services/api';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 呼叫登入 API
      const response = await login(username, password);
      
      if (response.success) {
        // 儲存使用者資訊和 token
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        onLogin(true, response.data.user.role);
      } else {
        setError(response.message || '帳號或密碼錯誤');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('登入失敗，請稍後再試');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      {/* 背景裝飾 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-10" 
             style={{ backgroundColor: 'var(--ncku-red)' }}></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10" 
             style={{ backgroundColor: 'var(--ncku-red)' }}></div>
      </div>

      <div className="relative w-full max-w-md p-8">
        {/* 科技感邊框效果 */}
        <div className="absolute inset-0 rounded-2xl opacity-20 blur-xl"
             style={{ backgroundColor: 'var(--ncku-red)' }}></div>
        
        {/* 登入卡片 */}
        <div className="relative bg-white rounded-2xl shadow-2xl p-10 border border-gray-200">
          {/* Logo 和標題 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4"
                 style={{ backgroundColor: 'var(--ncku-red)' }}>
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ncku-red)' }}>
              AI 客服系統
            </h1>
            <p className="text-gray-600 text-sm">管理後台登入</p>
          </div>

          {/* 登入表單 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                帳號
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none transition-all"
                  style={{ focusRingColor: 'var(--ncku-red)' }}
                  placeholder="請輸入帳號"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                密碼
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none transition-all"
                  placeholder="請輸入密碼"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: '#fee', color: 'var(--ncku-red)' }}>
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-semibold py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ backgroundColor: 'var(--ncku-red)' }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  登入中...
                </div>
              ) : (
                '登入'
              )}
            </button>
          </form>

          {/* 測試帳號提示 - 僅開發環境顯示 */}
          {import.meta.env.DEV && (
            <div className="mt-6 text-center text-xs text-gray-500 border-t pt-4">
              <p className="font-semibold mb-2">測試帳號</p>
              <div className="space-y-1">
                <p>系統管理員：superadmin / admin123</p>
                <p>人事室管理員：hr_admin / admin123</p>
                <p>會計室管理員：acc_admin / admin123</p>
                <p>總務處管理員：ga_admin / admin123</p>
              </div>
            </div>
          )}
        </div>

        {/* 科技感線條裝飾 */}
        <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg" 
             style={{ borderColor: 'var(--ncku-red)' }}></div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 rounded-br-lg" 
             style={{ borderColor: 'var(--ncku-red)' }}></div>
      </div>
    </div>
  );
}

export default Login;
