import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginWithGoogleToken } from '../services/queryAuth';
import { useQueryAuth } from '../contexts/QueryAuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-google-identity="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google SDK 載入失敗')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google SDK 載入失敗'));
    document.head.appendChild(script);
  });

function GoogleLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useQueryAuth();
  const from = location.state?.from || '/';
  const buttonRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initGoogle = async () => {
      if (!GOOGLE_CLIENT_ID) {
        setError('尚未設定 Google Client ID，請聯繫管理員');
        return;
      }

      try {
        await loadGoogleScript();
        if (!mounted || !window.google?.accounts?.id || !buttonRef.current) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response.credential) {
              setError('Google 未返回有效登入憑證');
              return;
            }

            try {
              setLoading(true);
              setError('');
              const data = await loginWithGoogleToken(response.credential);
              login(data.user);
              navigate(from, { replace: true });
            } catch (err) {
              setError(err.message || 'Google 登入失敗，請稍後再試');
            } finally {
              setLoading(false);
            }
          },
          ux_mode: 'popup',
          auto_select: false,
        });

        buttonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 320,
          shape: 'pill',
        });
      } catch (err) {
        setError(err.message || '無法載入 Google 登入元件');
      }
    };

    initGoogle();

    return () => {
      mounted = false;
    };
  }, [from, login, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <img
          src={`${import.meta.env.BASE_URL}images/google_logo.png`}
          alt="Google"
          className="w-16 h-16 object-contain mx-auto mb-4"
        />
        <h1 className="text-2xl font-bold text-gray-900">Google 登入</h1>
        <p className="text-gray-600 mt-3">
          使用 Google 帳號安全登入，不會建立後台查詢用戶資料。
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-center" ref={buttonRef} />

        {loading && <p className="text-sm text-gray-500 mt-4">登入驗證中...</p>}

        <div className="flex gap-3 mt-8">
          <button
            onClick={() => navigate('/login', { state: { from } })}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            返回登入選項
          </button>
          <button
            onClick={() => navigate(from, { replace: true })}
            className="flex-1 px-4 py-2 text-white rounded-lg bg-red-600 hover:bg-red-700 cursor-pointer"
          >
            稍後再登入
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoogleLoginPage;
