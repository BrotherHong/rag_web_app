import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryAuth } from '../contexts/QueryAuthContext';
import { useDepartment } from '../contexts/DepartmentContext';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useQueryAuth();
  const { department } = useDepartment();

  const handleLogout = () => {
    logout();
    // 登出後返回當前處室的起始頁面
    if (department?.slug) {
      navigate(`/${department.slug}`);
    } else {
      navigate('/');
    }
  };

  return (
    <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo 和處室名稱 */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer">
              <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {department ? department.name : '成功大學'}
                </div>
                <div className="text-xs text-gray-500">AI 查詢助手</div>
              </div>
            </Link>
          </div>

          {/* 右側按鈕區 */}
          <div className="flex items-center space-x-4">
            {isAuthenticated() ? (
              <>
                {/* 已登入：顯示用戶資訊和登出按鈕 */}
                <div className="flex items-center space-x-3">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">{user?.full_name}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    登出
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* 未登入：顯示登入按鈕 */}
                <button
                  onClick={() => navigate('/login', { state: { from: location.pathname } })}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-lg shadow-md hover:shadow-lg transition-all cursor-pointer"
                >
                  登入
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
