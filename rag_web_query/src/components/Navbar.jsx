import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryAuth } from '../contexts/QueryAuthContext';
import { useDepartment } from '../contexts/DepartmentContext';

function Navbar() {
  const navigate = useNavigate();
  const { deptSlug: paramSlug } = useParams();
  const { user, isAuthenticated, logout } = useQueryAuth();
  const { department } = useDepartment();

  const handleLogout = () => {
    logout();
    const target = paramSlug ? `/${paramSlug}` : '/';
    navigate(target, { replace: true });
  };

  return (
    <nav className="bg-white/90 backdrop-blur-md shadow border-b border-red-100 sticky top-0 z-50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          {/* Logo 和處室名稱 */}
          <Link to="/" className="flex items-center space-x-4 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="w-12 h-12 bg-gradient-to-br from-red-700 to-red-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900 leading-tight">
                {department ? department.name : '成功大學'}
              </div>
              <div className="text-sm text-red-600 font-medium">AI 查詢助手</div>
            </div>
          </Link>

          {/* 右側：已登入才顯示 */}
          {isAuthenticated() && (
            <div className="flex items-center space-x-4">
              <span className="text-base font-medium text-gray-700">{user?.full_name}</span>
              <button
                onClick={handleLogout}
                className="px-5 py-2 text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                登出
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
