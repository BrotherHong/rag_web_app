import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { forgotPasswordRequest, resetPasswordWithToken } from '../services/queryAuth';

// 忘記密碼流程：
// Step 1: 用戶輸入帳號/信箱 → 後端產生重設代碼（管理員可查看）
// Step 2: 用戶從管理員取得 8 位代碼後，輸入代碼 + 新密碼完成重設

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('request'); // 'request' | 'reset' | 'done'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [username, setUsername] = useState('');

  // Step 2
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRequestReset = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setError('');
    setLoading(true);
    try {
      await forgotPasswordRequest(username.trim());
      setStep('reset');
    } catch (err) {
      setError(err.message || '請求失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!resetToken.trim()) {
      setError('請輸入重設代碼');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密碼至少需要 6 個字元');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('兩次輸入的密碼不一致');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordWithToken(resetToken.trim(), newPassword);
      setStep('done');
    } catch (err) {
      setError(err.message || '重設失敗，請確認代碼是否正確');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* 返回登入 */}
        <Link
          to="/login"
          className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>返回登入</span>
        </Link>

        {/* 步驟指示 */}
        {step !== 'done' && (
          <div className="flex items-center justify-center mb-6 space-x-3">
            {[
              { key: 'request', label: '1. 申請代碼' },
              { key: 'reset', label: '2. 輸入代碼' },
            ].map((s) => (
              <div key={s.key} className="flex items-center">
                <div className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${step === s.key
                  ? 'bg-red-600 text-white'
                  : step === 'reset' && s.key === 'request'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'}`}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* ===== Step 1: 申請重設代碼 ===== */}
          {step === 'request' && (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-3">
                  <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-gray-900">忘記密碼</h1>
                <p className="text-sm text-gray-500 mt-1">
                  輸入您的帳號，系統將產生一組重設代碼。<br />
                  請聯繫管理員取得代碼後，回到此頁輸入。
                </p>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleRequestReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    使用者帳號或電子郵件
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="請輸入您的帳號或信箱"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg text-white font-semibold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center"
                  style={{ background: 'linear-gradient(to right, #dc2626, #b91c1c)' }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      處理中...
                    </>
                  ) : '申請重設代碼'}
                </button>
              </form>

              <p className="text-center text-xs text-gray-400 mt-4">
                已有重設代碼？{' '}
                <button
                  onClick={() => { setStep('reset'); setError(''); }}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  直接輸入代碼
                </button>
              </p>
            </>
          )}

          {/* ===== Step 2: 輸入代碼 + 新密碼 ===== */}
          {step === 'reset' && (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-full mb-3">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-gray-900">輸入重設代碼</h1>
                <p className="text-sm text-gray-500 mt-1">
                  請向管理員取得 8 位重設代碼（有效期 24 小時），<br />
                  並設定您的新密碼。
                </p>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    重設代碼
                  </label>
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value.toUpperCase())}
                    placeholder="例如：A3F9C2B1"
                    maxLength={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors font-mono tracking-widest text-center text-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    新密碼
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 6 個字元"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    確認新密碼
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次輸入新密碼"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg text-white font-semibold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center"
                  style={{ background: 'linear-gradient(to right, #dc2626, #b91c1c)' }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      重設中...
                    </>
                  ) : '確認重設密碼'}
                </button>
              </form>

              <button
                onClick={() => { setStep('request'); setError(''); }}
                className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                ← 返回上一步
              </button>
            </>
          )}

          {/* ===== Done ===== */}
          {step === 'done' && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">密碼已重設！</h2>
              <p className="text-gray-500 text-sm mb-6">請使用新密碼登入您的帳號。</p>
              <Link
                to="/login"
                className="block w-full py-3 rounded-lg text-white font-semibold text-center transition-all"
                style={{ background: 'linear-gradient(to right, #dc2626, #b91c1c)' }}
              >
                前往登入
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
