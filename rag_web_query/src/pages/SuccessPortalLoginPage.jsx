import { useLocation, useNavigate } from 'react-router-dom';

function SuccessPortalLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 11c0-1.657 1.79-3 4-3s4 1.343 4 3m-8 0c0-1.657-1.79-3-4-3S4 9.343 4 11m8 0v7m0-7h8v7h-8m0 0H4v-7h8" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">成功入口登入</h1>
        <p className="text-gray-600 mt-3">
          成功入口登入流程頁面已建立，後續會接上校內 SSO 驗證。
        </p>

        <div className="flex gap-3 mt-8">
          <button
            onClick={() => navigate('/login', { state: { from } })}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            返回登入選項
          </button>
          <button
            onClick={() => navigate(from, { replace: true })}
            className="flex-1 px-4 py-2 text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
          >
            返回原頁
          </button>
        </div>
      </div>
    </div>
  );
}

export default SuccessPortalLoginPage;
