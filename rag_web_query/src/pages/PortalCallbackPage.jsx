import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { saveQueryToken, saveQueryUser } from '../services/queryAuth';
import { useQueryAuth } from '../contexts/QueryAuthContext';

function PortalCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useQueryAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const from = searchParams.get('from') || '/';

    if (!token) {
      setError('成功入口登入失敗：未收到 token');
      return;
    }

    try {
      // 解碼 JWT payload 取得使用者資訊
      const payloadBase64 = token.split('.')[1];
      const padding = 4 - (payloadBase64.length % 4);
      const padded = payloadBase64 + '='.repeat(padding % 4);
      const payload = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));

      const commonname = payload.sub || '';
      const email = payload.email || '';
      const identity = payload.identity || '';
      const fullname = payload.name || commonname;

      const user = {
        id: `portal:${commonname}`,
        username: commonname,
        email,
        full_name: fullname,
        status: 'approved',
        is_active: true,
        default_department_id: null,
        auth_provider: 'success_portal',
        is_managed_user: false,
        identity,
      };

      saveQueryToken(token);
      saveQueryUser(user);
      login(user);
      navigate(from, { replace: true });
    } catch {
      setError('成功入口登入失敗：token 解析錯誤');
    }
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <p className="text-red-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            返回登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-emerald-600 border-r-transparent" />
        <p className="mt-4 text-gray-600">正在完成成功入口登入…</p>
      </div>
    </div>
  );
}

export default PortalCallbackPage;
