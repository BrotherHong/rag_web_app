import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { registerQueryUser } from '../services/queryAuth';
import { getDepartmentInfo } from '../services/api';

function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [deptId, setDeptId] = useState(null);
  const [deptName, setDeptName] = useState('');

  const backPath = location.state?.from || '/';

  // 解析來源路徑中的處室 slug 並取得處室 ID
  useEffect(() => {
    const slug = backPath.split('/').filter(Boolean)[0];
    if (slug && slug !== 'login' && slug !== 'register') {
      getDepartmentInfo(slug).then(res => {
        if (res.success && res.data?.id) {
          setDeptId(res.data.id);
          setDeptName(res.data.name || '');
        }
      }).catch(() => {});
    }
  }, [backPath]);

  const validate = () => {
    const errors = {};
    if (!formData.username.trim()) errors.username = '必填';
    else if (!/^[a-zA-Z0-9_-]{3,50}$/.test(formData.username))
      errors.username = '只能包含英文、數字、底線和連字號（3-50 字元）';

    if (!formData.email.trim()) errors.email = '必填';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errors.email = '請輸入有效的電子郵件';

    if (!formData.password) errors.password = '必填';
    else if (formData.password.length < 6) errors.password = '至少 6 個字元';

    if (formData.password !== formData.confirmPassword)
      errors.confirmPassword = '密碼不一致';

    if (!formData.full_name.trim()) errors.full_name = '必填';

    return errors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // 清除該欄位的錯誤
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await registerQueryUser({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        application_reason: '用戶自行註冊',
        default_department_id: deptId || undefined
      });
      setStep('success');
    } catch (err) {
      setError(err.message || '註冊失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">申請已提交！</h2>
            <p className="text-gray-600 mb-2">
              您的帳號申請已成功提交，請等待管理員審核。
            </p>
            <p className="text-sm text-gray-500 mb-6">
              審核通過後即可使用帳號登入。如有疑問，請聯繫系統管理員。
            </p>
            <button
              onClick={() => navigate(backPath)}
              className="w-full py-3 rounded-lg text-white font-semibold transition-all"
              style={{ background: 'linear-gradient(to right, #dc2626, #b91c1c)' }}
            >
              返回首頁
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-lg w-full">
        {/* 返回按鈕 */}
        <button
          onClick={() => navigate(backPath)}
          className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>返回</span>
        </button>

        {/* 標題 */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-3 shadow-md"
            style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {deptName ? `${deptName} 帳號申請` : '帳號申請'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">提交申請後，管理員審核通過即可使用</p>
        </div>

        {/* 表單 */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
              <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 第一行：帳號 & 全名 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  使用者帳號 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="英文+數字，3-50字"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors ${fieldErrors.username ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {fieldErrors.username && <p className="text-xs text-red-500 mt-1">{fieldErrors.username}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="您的真實姓名"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors ${fieldErrors.full_name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {fieldErrors.full_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.full_name}</p>}
              </div>
            </div>

            {/* 電子郵件 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電子郵件 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your@email.com"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors ${fieldErrors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
              />
              {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
            </div>

            {/* 密碼 & 確認密碼 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密碼 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="至少 6 個字元"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors ${fieldErrors.password ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  確認密碼 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="再次輸入密碼"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors ${fieldErrors.confirmPassword ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {fieldErrors.confirmPassword && <p className="text-xs text-red-500 mt-1">{fieldErrors.confirmPassword}</p>}
              </div>
            </div>

            {/* 提交按鈕 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center mt-2"
              style={{ background: 'linear-gradient(to right, #dc2626, #b91c1c)' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  提交中...
                </>
              ) : '提交申請'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            已有帳號？{' '}
            <Link
              to="/login"
              className="text-red-600 hover:text-red-700 font-medium hover:underline"
            >
              立即登入
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
