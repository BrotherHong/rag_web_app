import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveQueryToken, saveQueryUser } from '../services/queryAuth';
import { useQueryAuth } from '../contexts/QueryAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
// 登入視窗開啟後的整體逾時，避免使用者卡在授權頁時按鈕永遠停在「登入中」
const POPUP_TIMEOUT_MS = 5 * 60 * 1000;

// 解析後端回傳的系統 JWT，組成前端使用者物件（與 PortalCallbackPage 一致）
const buildUserFromToken = (token) => {
  const payloadBase64 = token.split('.')[1];
  const padding = 4 - (payloadBase64.length % 4);
  const padded = payloadBase64 + '='.repeat(padding % 4);
  const payload = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));

  const commonname = payload.sub || '';
  const email = payload.email || '';
  const identity = payload.identity || '';
  const fullname = payload.name || commonname;

  return {
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
};

function SuccessPortalLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useQueryAuth();
  const from = location.state?.from || '/';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const popupRef = useRef(null);
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  // 停止監看彈出視窗，並重置按鈕狀態
  const stopWatching = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    popupRef.current = null;
    setLoading(false);
  };

  const finishLogin = (token) => {
    try {
      const user = buildUserFromToken(token);
      saveQueryToken(token);
      saveQueryUser(user);
      login(user);
      navigate(from, { replace: true });
    } catch {
      setError('成功入口登入失敗：登入資訊解析錯誤，請重試。');
      setLoading(false);
    }
  };

  // 接收彈出視窗（PortalCallbackPage）回傳的登入結果
  useEffect(() => {
    const handleMessage = (event) => {
      // 只接受同源、且來自成功入口登入流程的訊息
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== 'portal-login') return;

      // 先停掉關閉偵測與逾時，避免我們主動關閉視窗時被誤判為「使用者關閉」
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;

      if (data.status === 'success' && data.token) {
        finishLogin(data.token);
      } else {
        setError(data.message || '成功入口登入失敗，請重試。');
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // 元件卸載時關閉殘留的登入視窗
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const handleLogin = () => {
    setError('');

    const loginUrl = `${API_BASE_URL}/query-auth/portal-login?from_path=${encodeURIComponent(from)}`;

    // 置中開啟登入視窗
    const width = 480;
    const height = 640;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const popup = window.open(
      loginUrl,
      'ncku_portal_login',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    // 被瀏覽器封鎖彈出視窗
    if (!popup) {
      setError('登入視窗被瀏覽器封鎖，請允許此網站的彈出視窗後再試一次。');
      return;
    }

    popupRef.current = popup;
    setLoading(true);
    try {
      popup.focus();
    } catch {
      // 部分瀏覽器不允許 focus，忽略即可
    }

    // 偵測使用者手動關閉登入視窗
    pollRef.current = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        stopWatching();
        setError((prev) => prev || '登入視窗已關閉，若尚未完成登入請再試一次。');
      }
    }, 500);

    // 整體逾時（例如登入頁失效、使用者停在授權頁太久）
    timeoutRef.current = setTimeout(() => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      stopWatching();
      setError('登入逾時，請重試。');
    }, POPUP_TIMEOUT_MS);
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

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full mt-6 px-6 py-3 text-white font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {loading ? '請在登入視窗中完成登入…' : '使用成功入口登入'}
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
