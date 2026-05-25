import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function SuccessPortalLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    // 跳轉到後端，後端再轉到 NCKU ADFS
    window.location.href = `${API_BASE_URL}/query-auth/portal-login?from_path=${encodeURIComponent(from)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 md:p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">成功入口登入</h1>
        <p className="text-gray-600 mt-3">
          使用成大成功入口（NCKU SSO）帳號登入，免另行申請帳號。
        </p>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full mt-6 px-6 py-3 text-white font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 cursor-pointer transition-colors"
        >
          {loading ? '導向中…' : '使用成功入口登入'}
        </button>

        <button
          onClick={() => navigate('/login', { state: { from } })}
          className="w-full mt-3 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-600"
        >
          返回登入選項
        </button>
      </div>
    </div>
  );
}

export default SuccessPortalLoginPage;
