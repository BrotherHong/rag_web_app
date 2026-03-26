import { useLocation, useNavigate } from 'react-router-dom';

function GoogleLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center mb-4 text-2xl font-bold">
          G
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Google 登入</h1>
        <p className="text-gray-600 mt-3">
          Google 登入流程頁面已建立，後續會接上 OAuth 實際驗證。
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
            className="flex-1 px-4 py-2 text-white rounded-lg bg-red-600 hover:bg-red-700 cursor-pointer"
          >
            返回原頁
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoogleLoginPage;
