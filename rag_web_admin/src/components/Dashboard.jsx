import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  logout, 
  getStatistics, 
  getRecentActivities,
  getCategoriesWithDetails,
  addCategory,
  deleteCategory,
  getFaqs,
  addFaq,
  updateFaq,
  deleteFaq,
  toggleFaqStatus
} from '../services/api';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useToast } from '../contexts/ToastContext';
import ConfirmDialog from './common/ConfirmDialog';
import KnowledgeBase from './KnowledgeBase';
import UploadFiles from './UploadFiles';
import QueryUserManagement from './QueryUserManagement';
import { getActivityConfig } from '../utils/activityConfig';

function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentPage, setCurrentPage] = useState('knowledge-base');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    try {
      // 呼叫登出 API
      await logout();
      
      // 清除本地存儲
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // 觸發認證變更事件
      window.dispatchEvent(new Event('authChange'));
      
      // 導航到登入頁
      navigate('/', { replace: true });
    } catch (error) {
      console.error('登出錯誤:', error);
      // 即使 API 失敗也要登出
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('authChange'));
      navigate('/', { replace: true });
    }
  };

  // 獲取使用者資訊
  const getUserInfo = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : { name: '管理員', username: 'Admin', role: 'admin', departmentId: null };
    } catch {
      return { name: '管理員', username: 'Admin', role: 'admin', departmentId: null };
    }
  };

  const user = getUserInfo();
  
  // 返回系統管理後台（當系統管理員代理時）
  const returnToSuperAdmin = () => {
    try {
      const superAdminUserStr = localStorage.getItem('superAdminUser');
      if (superAdminUserStr) {
        const superAdminUser = JSON.parse(superAdminUserStr);
        
        // 直接使用保存的 superAdminUser,不再進行任何修改
        // 因為保存時已經確保是純 super_admin 身分
        localStorage.setItem('user', JSON.stringify(superAdminUser));
        localStorage.removeItem('superAdminUser');
        
        // 先導航，再非同步觸發事件，減少閃爍
        navigate('/super-admin', { replace: true });
        
        // 使用 setTimeout 確保導航完成後再觸發事件
        setTimeout(() => {
          window.dispatchEvent(new Event('authChange'));
        }, 0);
      }
    } catch (error) {
      console.error('返回系統管理後台錯誤:', error);
    }
  };
  
  // 取得處室名稱
  const getDepartmentName = () => {
    // 登入時後端已返回 departmentName,直接使用即可
    if (user.departmentName) {
      return user.departmentName;
    }
    
    // 系統管理員沒有處室
    if (!user.departmentId) return '系統';
    
    // 如果缺少 departmentName,顯示預設值
    return '未知處室';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 頂部導航欄 */}
      <header className="text-white shadow-lg sticky top-0 z-50" 
              style={{ backgroundColor: 'var(--ncku-red)' }}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h1 className="text-xl font-bold">{getDepartmentName()} AI 客服</h1>
                  <p className="text-xs text-red-100">後台管理系統</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user.name}</p>
                <div className="flex items-center justify-end space-x-2">
                  <p className="text-xs text-red-100">{user.username}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    管理員
                  </span>
                  {user.isSuperAdminProxy && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                      系統管理員代理
                    </span>
                  )}
                </div>
              </div>
              {user.isSuperAdminProxy && (
                <button
                  onClick={returnToSuperAdmin}
                  className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors flex items-center space-x-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>返回系統管理</span>
                </button>
              )}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="bg-white text-black px-4 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{ color: 'var(--ncku-red)' }}
              >
                {isLoggingOut ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-solid border-current border-r-transparent"></div>
                    <span>登出中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>登出</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 側邊欄 */}
        <aside className="w-64 bg-white border-r border-gray-200 h-[calc(100vh-80px)] fixed left-0 top-[80px] overflow-y-auto">
          <nav className="p-4 space-y-2">
            <button
              onClick={() => setCurrentPage('knowledge-base')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'knowledge-base'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'knowledge-base' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="font-medium">知識庫管理</span>
            </button>

            <button
              onClick={() => setCurrentPage('upload-files')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'upload-files'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'upload-files' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="font-medium">上傳檔案</span>
            </button>

            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'dashboard'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'dashboard' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="font-medium">儀表板</span>
            </button>

            <button
              onClick={() => setCurrentPage('categories')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'categories'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'categories' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="font-medium">分類管理</span>
            </button>

            <button
              onClick={() => setCurrentPage('user-groups')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'user-groups'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'user-groups' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-medium">身分組管理</span>
            </button>

            <button
              onClick={() => setCurrentPage('query-users')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'query-users'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'query-users' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="font-medium">查詢用戶</span>
            </button>

            <button
              onClick={() => setCurrentPage('faqs')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'faqs'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'faqs' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">常見問題</span>
            </button>
          </nav>

          {/* 科技感裝飾 */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span>系統運行正常</span>
              </div>
            </div>
          </div>
        </aside>

        {/* 主要內容區域 */}
        <main className="flex-1 p-8 ml-64">
          {currentPage === 'knowledge-base' && <KnowledgeBase />}
          {currentPage === 'upload-files' && (
            <UploadFiles 
              onNavigateToKnowledgeBase={() => setCurrentPage('knowledge-base')} 
            />
          )}
          {currentPage === 'dashboard' && <DashboardHome />}
          {currentPage === 'categories' && <CategoryManagement />}
          {currentPage === 'user-groups' && <UserGroupManagement />}
          {currentPage === 'query-users' && <QueryUserManagement />}
          {currentPage === 'faqs' && <FaqManagement />}
        </main>
      </div>
    </div>
  );
}

// 儀表板首頁組件
function DashboardHome() {
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // 並行載入統計資料和活動記錄
      const [statsResponse, activitiesResponse] = await Promise.all([
        getStatistics(),
        getRecentActivities(5)
      ]);

      if (statsResponse.success) {
        setStats(statsResponse.data);
      } else {
        // API 調用失敗時,設定一個空的預設值而不是 null
        console.error('獲取統計資料失敗:', statsResponse.message);
        setStats({
          totalFiles: 0,
          filesByCategory: {},
          monthlyQueries: 0,
          systemStatus: { status: 'unknown', message: '無法獲取系統狀態' },
          storageUsed: '0 GB',
          storageTotal: '100 GB'
        });
      }

      if (activitiesResponse.success) {
        setActivities(activitiesResponse.data);
      } else {
        console.error('獲取活動記錄失敗:', activitiesResponse.message);
      }
    } catch (error) {
      console.error('載入儀表板資料錯誤:', error);
      // 發生異常時也設定預設值
      setStats({
        totalFiles: 0,
        filesByCategory: {},
        monthlyQueries: 0,
        systemStatus: { status: 'error', message: '載入失敗' },
        storageUsed: '0 GB',
        storageTotal: '100 GB'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now - time) / (1000 * 60));

    if (diffInMinutes < 1) return '剛剛';
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小時前`;
    return `${Math.floor(diffInMinutes / 1440)} 天前`;
  };

  // 根據檔案類型返回圖示
  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (ext === 'pdf') {
      return (
        <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'doc' || ext === 'docx') {
      return (
        <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'xls' || ext === 'xlsx') {
      return (
        <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'ppt' || ext === 'pptx') {
      return (
        <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'txt') {
      return (
        <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    );
  };

  const getActivityIcon = (type) => {
    if (type === 'UPLOAD') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      );
    } else if (type === 'DOWNLOAD') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
        </svg>
      );
    } else if (type === 'DELETE') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    } else if (type === 'CREATE_CATEGORY' || type === 'UPDATE_CATEGORY') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
    } else if (type === 'DELETE_CATEGORY') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    } else if (type === 'CREATE_USER' || type === 'UPDATE_USER' || type === 'DELETE_USER') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    } else if (type === 'UPDATE_FILE') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    } else if (type === 'LOGIN' || type === 'LOGOUT') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>
      );
    } else if (type === 'QUERY' || type === 'SEARCH') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  const getActivityText = (activity) => {
    const typeMap = {
      'LOGIN': '登入系統',
      'LOGOUT': '登出系統',
      'UPLOAD': '上傳檔案',
      'DOWNLOAD': '下載檔案',
      'DELETE': '刪除檔案',
      'SEARCH': '搜尋檔案',
      'QUERY': 'RAG 查詢',
      'UPDATE_PROFILE': '更新個人資料',
      'UPDATE_FILE': '更新檔案資訊',
      'CREATE_USER': '建立使用者',
      'UPDATE_USER': '更新使用者',
      'DELETE_USER': '刪除使用者',
      'CREATE_CATEGORY': '建立分類',
      'UPDATE_CATEGORY': '更新分類',
      'DELETE_CATEGORY': '刪除分類'
    };
    return typeMap[activity.type] || '未知操作';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
          <svg className="w-8 h-8" style={{ color: 'var(--ncku-red)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-gray-800 font-medium mb-2">無法載入儀表板資料</p>
        <p className="text-gray-600 text-sm mb-4">請確認您的帳號已正確登入並分配到處室</p>
        <button 
          onClick={loadDashboardData}
          className="px-4 py-2 rounded-lg text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--ncku-red)' }}>
        系統概覽
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6 border-l-4" 
             style={{ borderColor: 'var(--ncku-red)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">知識庫檔案</p>
              <p className="text-3xl font-bold mt-2">{stats.totalFiles}</p>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" style={{ color: 'var(--ncku-red)' }} fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">本月查詢次數</p>
              <p className="text-3xl font-bold mt-2">{stats.monthlyQueries.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">系統狀態</p>
              <p className="text-xl font-bold mt-2 text-green-600">
                {stats.systemStatus?.status === 'running' ? '運行正常' : 
                 stats.systemStatus?.status === 'unknown' ? '未知' : '異常'}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">最近活動</h3>
          <div className="space-y-4">
            {activities.length > 0 ? (
              activities.map((activity) => {
              const config = getActivityConfig(activity.type?.toLowerCase());
              const extractTarget = (description) => {
                const colonIndex = description?.indexOf(':');
                if (colonIndex > -1) {
                  return description.substring(colonIndex + 1).trim();
                }
                return description || '系統操作';
              };
              
              return (
                <div key={activity.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  {/* 操作類型圖示 */}
                  <div className="flex-shrink-0">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: config.bgColor }}
                    >
                      <svg 
                        className="w-5 h-5" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        style={{ color: config.iconColor }}
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d={config.icon}
                        />
                      </svg>
                    </div>
                  </div>
                  
                  {/* 活動詳情 */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-base mb-1">
                      {config.label}
                    </p>
                    <p className="text-sm text-gray-700 mb-1 font-medium">
                      {extractTarget(activity.description)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="flex items-center">
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {activity.user || '系統'}
                      </span>
                      <span className="flex items-center text-gray-500">
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-gray-500 text-center py-4">暫無活動記錄</p>
          )}
          </div>
        </div>

        {/* 查詢類別統計 */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">本月查詢類別統計</h3>
          {stats.queriesByCategory && stats.queriesByCategory.length > 0 ? (
            <div className="flex flex-col items-center">
              {/* 圓餅圖 */}
              <div className="mb-4">
                {(() => {
                  const data = stats.queriesByCategory;
                  const total = data.reduce((sum, item) => sum + (item.queryCount || 0), 0);
                  if (total === 0) return <p className="text-gray-500">暫無查詢資料</p>;
                  
                  const radius = 70;
                  const cx = 90;
                  const cy = 90;
                  
                  // 只有一個類別時，繪製完整圓形
                  if (data.length === 1) {
                    return (
                      <div className="flex justify-center">
                        <svg width="180" height="180" viewBox="0 0 180 180">
                          <circle
                            cx={cx}
                            cy={cy}
                            r={radius}
                            fill={data[0].color || '#9ca3af'}
                            stroke="white"
                            strokeWidth="2"
                          >
                            <title>{data[0].categoryName}: {data[0].queryCount} 次 (100%)</title>
                          </circle>
                        </svg>
                      </div>
                    );
                  }
                  
                  let cumulativeAngle = 0;
                  
                  return (
                    <div className="flex justify-center">
                      <svg width="180" height="180" viewBox="0 0 180 180">
                        {data.map((item, idx) => {
                          const percentage = (item.queryCount / total) * 100;
                          const angle = (percentage / 100) * 360;
                          const startAngle = cumulativeAngle;
                          const endAngle = cumulativeAngle + angle;
                          
                          const startRad = (startAngle - 90) * (Math.PI / 180);
                          const endRad = (endAngle - 90) * (Math.PI / 180);
                          
                          const x1 = cx + radius * Math.cos(startRad);
                          const y1 = cy + radius * Math.sin(startRad);
                          const x2 = cx + radius * Math.cos(endRad);
                          const y2 = cy + radius * Math.sin(endRad);
                          
                          const largeArc = angle > 180 ? 1 : 0;
                          const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                          
                          cumulativeAngle = endAngle;
                          
                          return (
                            <path
                              key={idx}
                              d={pathData}
                              fill={item.color || '#6b7280'}
                              stroke="white"
                              strokeWidth="2"
                            >
                              <title>{item.categoryName}: {item.queryCount} 次 ({percentage.toFixed(1)}%)</title>
                            </path>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
              
              {/* 圖例 */}
              <div className="w-full space-y-2">
                {stats.queriesByCategory.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded" 
                        style={{ backgroundColor: item.color || '#6b7280' }}
                      ></div>
                      <span className="text-gray-700">{item.categoryName}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{item.queryCount} 次</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-gray-500 font-medium mb-1">本月查詢未使用類別篩選</p>
              <p className="text-gray-400 text-sm">
                {stats.monthlyQueries > 0 
                  ? `共 ${stats.monthlyQueries} 筆查詢，皆未指定類別過濾條件` 
                  : '本月暫無查詢記錄'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 分類管理頁面組件
function CategoryManagement() {
  const toast = useToast();  // 添加 toast hook
  const [categories, setCategories] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6');  // 預設藍色
  const [isLoading, setIsLoading] = useState(true);

  // 對話框動畫
  const addModal = useModalAnimation(showAddModal, () => setShowAddModal(false));
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));

  // 可用的顏色選項
  const colorOptions = [
    { value: '#3B82F6', label: '藍色' },
    { value: '#10B981', label: '綠色' },
    { value: '#F59E0B', label: '黃色' },
    { value: '#EF4444', label: '紅色' },
    { value: '#8B5CF6', label: '紫色' },
    { value: '#EC4899', label: '粉色' },
    { value: '#6366F1', label: '靛藍' },
    { value: '#F97316', label: '橙色' },
  ];

  // 載入分類列表
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const response = await getCategoriesWithDetails();
      if (response.success) {
        setCategories(response.data);
      } else {
        console.error('載入分類失敗:', response.message);
      }
    } catch (error) {
      console.error('載入分類錯誤:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (newCategoryName.trim()) {
      try {
        const response = await addCategory(newCategoryName, newCategoryColor);
        if (response.success) {
          // 重新載入分類列表
          await loadCategories();
          setNewCategoryName('');
          setNewCategoryColor('#3B82F6');
          addModal.handleClose();
          toast.success('分類新增成功');
        } else {
          toast.error('新增失敗：' + response.message);
        }
      } catch (error) {
        console.error('新增分類錯誤:', error);
        toast.error('新增分類失敗');
      }
    }
  };

  const handleDeleteCategory = async (category) => {
    setShowDeleteConfirm(category);
  };

  const confirmDeleteCategory = async () => {
    if (!showDeleteConfirm) return;
    
    try {
      const response = await deleteCategory(showDeleteConfirm.id);
      if (response.success) {
        // 重新載入分類列表
        await loadCategories();
        toast.success('分類刪除成功');
      } else {
        toast.error('刪除失敗：' + response.message);
      }
    } catch (error) {
      console.error('刪除分類錯誤:', error);
      toast.error('刪除分類失敗');
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">分類管理</h3>
          <p className="text-sm text-gray-600 mt-1">管理知識庫的檔案分類</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-white rounded-lg shadow hover:shadow-lg transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          + 新增分類
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(category => (
          <div key={category.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: category.color }}
                ></div>
                <div>
                  <h4 className="font-medium text-gray-900">
                    {category.name}
                    {category.name === '其他' && (
                      <span className="ml-2 text-xs text-gray-500">(預設)</span>
                    )}
                  </h4>
                  <p className="text-sm text-gray-500">{category.fileCount || 0} 個檔案</p>
                </div>
              </div>
              {category.name !== '其他' && (
                <button
                  onClick={() => handleDeleteCategory(category)}
                  className="text-red-600 hover:text-red-800 cursor-pointer"
                  title="刪除分類"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {addModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${addModal.animationClass}`}>
          <div className={`bg-white rounded-lg p-6 w-96 mx-4 ${addModal.contentAnimationClass}`}>
            <h3 className="text-lg font-semibold mb-4">新增分類</h3>
            
            {/* 分類名稱輸入 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                分類名稱
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="輸入分類名稱"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ncku-red focus:border-transparent"
                autoFocus
              />
            </div>

            {/* 顏色選擇 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                選擇顏色
              </label>
              <div className="grid grid-cols-4 gap-2">
                {colorOptions.map(color => (
                  <button
                    key={color.value}
                    onClick={() => setNewCategoryColor(color.value)}
                    className={`flex flex-col items-center p-2 rounded-lg border-2 transition-all cursor-pointer ${
                      newCategoryColor === color.value 
                        ? 'border-gray-800 bg-gray-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full mb-1" style={{ backgroundColor: color.value }}></div>
                    <span className="text-xs text-gray-600">{color.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 按鈕 */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  addModal.handleClose();
                  setNewCategoryName('');
                  setNewCategoryColor('#3B82F6');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="px-4 py-2 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        shouldRender={deleteModal.shouldRender}
        isClosing={deleteModal.isClosing}
        animationClass={deleteModal.animationClass}
        contentAnimationClass={deleteModal.contentAnimationClass}
        onClose={deleteModal.handleClose}
        onConfirm={confirmDeleteCategory}
        title="確認刪除"
        message={`確定要刪除分類「${showDeleteConfirm?.name}」嗎？`}
        confirmText="刪除"
        cancelText="取消"
      />
    </div>
  );
}

// FAQ 管理頁面組件
function FaqManagement() {
  const toast = useToast();
  const [faqs, setFaqs] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [currentFaq, setCurrentFaq] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 表單資料
  const [formData, setFormData] = useState({
    category: '基本操作',
    question: '',
    description: '',
    answer: '',
    icon: '📋',
    order: 0,
    is_active: true
  });

  // 對話框動畫
  const addModal = useModalAnimation(showAddModal, () => setShowAddModal(false));
  const editModal = useModalAnimation(showEditModal, () => setShowEditModal(false));
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));

  // 可用的分類選項
  const categoryOptions = [
    '基本操作',
    '系統功能',
    '人事相關',
    '行政相關',
    '其他'
  ];

  // 可用的圖示選項
  const iconOptions = [
    '📋', '📄', '🔍', '📅', '💰', '✈️', '📆',
    '🕒', '📝', '💼', '📧', '📞', '🏢', '👥',
    '⚙️', '🔔', '📊', '📈', '🎯', '❓', '💡'
  ];

  useEffect(() => {
    loadFaqs();
  }, []);

  const loadFaqs = async () => {
    setIsLoading(true);
    try {
      const response = await getFaqs();
      if (response.success) {
        setFaqs(response.data);
      } else {
        console.error('載入 FAQ 失敗:', response.message);
        toast.error(response.message);
      }
    } catch (error) {
      console.error('載入 FAQ 錯誤:', error);
      toast.error('載入 FAQ 失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: '基本操作',
      question: '',
      description: '',
      answer: '',
      icon: '📋',
      order: 0,
      is_active: true
    });
    setCurrentFaq(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEdit = (faq) => {
    setCurrentFaq(faq);
    setFormData({
      category: faq.category,
      question: faq.question,
      description: faq.description || '',
      answer: faq.answer || '',
      icon: faq.icon || '📋',
      order: faq.order,
      is_active: faq.is_active
    });
    setShowEditModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.question.trim()) {
      toast.error('請輸入問題');
      return;
    }

    try {
      let response;
      if (currentFaq) {
        response = await updateFaq(currentFaq.id, formData);
      } else {
        response = await addFaq(formData);
      }

      if (response.success) {
        await loadFaqs();
        addModal.handleClose();
        editModal.handleClose();
        resetForm();
        toast.success(currentFaq ? 'FAQ 更新成功' : 'FAQ 新增成功');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error('提交 FAQ 錯誤:', error);
      toast.error('操作失敗');
    }
  };

  const handleDelete = (faq) => {
    setShowDeleteConfirm(faq);
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;

    try {
      const response = await deleteFaq(showDeleteConfirm.id);
      if (response.success) {
        await loadFaqs();
        toast.success('FAQ 刪除成功');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error('刪除 FAQ 錯誤:', error);
      toast.error('刪除失敗');
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  const handleToggleStatus = async (faq) => {
    try {
      const response = await toggleFaqStatus(faq.id, !faq.is_active);
      if (response.success) {
        await loadFaqs();
        toast.success(faq.is_active ? 'FAQ 已停用' : 'FAQ 已啟用');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error('切換狀態錯誤:', error);
      toast.error('操作失敗');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">常見問題管理</h3>
          <p className="text-sm text-gray-600 mt-1">管理本處室的常見問題，這些問題會顯示在使用者查詢頁面</p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-white rounded-lg shadow hover:shadow-lg transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          + 新增 FAQ
        </button>
      </div>

      {/* FAQ 列表 */}
      <div className="space-y-4">
        {faqs.length > 0 ? (
          faqs.map((faq) => (
            <div key={faq.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-2xl mt-1">{faq.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900">{faq.question}</h4>
                      {/* 分類標籤 - 暫時隱藏 */}
                      {/* <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {faq.category}
                      </span> */}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        faq.is_active 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {faq.is_active ? '啟用中' : '已停用'}
                      </span>
                    </div>
                    {faq.description && (
                      <p className="text-sm text-gray-600 mb-2">{faq.description}</p>
                    )}
                    {faq.answer && (
                      <p className="text-sm text-gray-500 line-clamp-2">{faq.answer}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleToggleStatus(faq)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      faq.is_active 
                        ? 'text-gray-600 hover:bg-gray-100' 
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={faq.is_active ? '停用' : '啟用'}
                  >
                    {faq.is_active ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(faq)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="編輯"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(faq)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="刪除"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-600 mb-2">尚無常見問題</p>
            <p className="text-sm text-gray-500">點擊上方按鈕新增第一個常見問題</p>
          </div>
        )}
      </div>

      {/* 新增/編輯 Modal */}
      {(addModal.shouldRender || editModal.shouldRender) && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${
          addModal.shouldRender ? addModal.animationClass : editModal.animationClass
        }`}>
          <div className={`bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto ${
            addModal.shouldRender ? addModal.contentAnimationClass : editModal.contentAnimationClass
          }`}>
            <h3 className="text-lg font-semibold mb-4">
              {currentFaq ? '編輯 FAQ' : '新增 FAQ'}
            </h3>

            <div className="space-y-4">
              {/* 分類 - 暫時隱藏 */}
              {/* <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  分類 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ncku-red focus:border-transparent"
                >
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div> */}

              {/* 圖示 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  圖示
                </label>
                <div className="grid grid-cols-10 gap-2">
                  {iconOptions.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData({...formData, icon})}
                      className={`text-2xl p-2 rounded-lg border-2 transition-all cursor-pointer ${
                        formData.icon === icon 
                          ? 'border-gray-800 bg-gray-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* 問題 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  問題 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.question}
                  onChange={(e) => setFormData({...formData, question: e.target.value})}
                  placeholder="例如：如何上傳文件？"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ncku-red focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* 簡短描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  簡短描述（顯示在卡片上）
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="例如：了解文件上傳流程與支援格式"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ncku-red focus:border-transparent"
                />
              </div>

              {/* 詳細解答 - 暫時隱藏 */}
              {/* <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  詳細解答
                </label>
                <textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({...formData, answer: e.target.value})}
                  placeholder="詳細說明此問題的解答..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ncku-red focus:border-transparent"
                />
              </div> */}

              {/* 啟用狀態 */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 rounded border-gray-300 text-ncku-red focus:ring-ncku-red cursor-pointer"
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 cursor-pointer">
                  立即啟用此 FAQ
                </label>
              </div>
            </div>

            {/* 按鈕 */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  if (currentFaq) {
                    editModal.handleClose();
                  } else {
                    addModal.handleClose();
                  }
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.question.trim()}
                className="px-4 py-2 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                {currentFaq ? '更新' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        shouldRender={deleteModal.shouldRender}
        isClosing={deleteModal.isClosing}
        animationClass={deleteModal.animationClass}
        contentAnimationClass={deleteModal.contentAnimationClass}
        onClose={deleteModal.handleClose}
        onConfirm={confirmDelete}
        title="確認刪除"
        message={`確定要刪除「${showDeleteConfirm?.question}」嗎？`}
        confirmText="刪除"
        cancelText="取消"
      />
    </div>
  );
}

// 身分組管理頁面組件
function UserGroupManagement() {
  const toast = useToast();
  const [userGroups, setUserGroups] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 表單資料
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  });

  // 可用的顏色選項
  const colorOptions = [
    { value: '#3B82F6', label: '藍色' },
    { value: '#10B981', label: '綠色' },
    { value: '#F59E0B', label: '黃色' },
    { value: '#EF4444', label: '紅色' },
    { value: '#8B5CF6', label: '紫色' },
    { value: '#EC4899', label: '粉色' },
    { value: '#6366F1', label: '靛藍' },
    { value: '#F97316', label: '橙色' },
  ];

  // 對話框動畫
  const addModal = useModalAnimation(showAddModal, () => setShowAddModal(false));
  const editModal = useModalAnimation(showEditModal, () => setShowEditModal(false));
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));

  // 載入身分組列表
  useEffect(() => {
    loadUserGroups();
  }, []);

  const loadUserGroups = async () => {
    setIsLoading(true);
    try {
      const { getUserGroups } = await import('../services/api');
      const response = await getUserGroups(true);
      if (response.success) {
        setUserGroups(response.data);
      } else {
        toast.error('載入身分組失敗：' + response.message);
      }
    } catch (error) {
      console.error('載入身分組錯誤:', error);
      toast.error('載入身分組失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddGroup = async () => {
    if (!formData.name.trim()) {
      toast.error('請輸入身分組名稱');
      return;
    }

    try {
      const { createUserGroup } = await import('../services/api');
      const response = await createUserGroup(formData);
      if (response.success) {
        await loadUserGroups();
        setFormData({ name: '', description: '', color: '#3B82F6' });
        addModal.handleClose();
        toast.success('身分組新增成功');
      } else {
        toast.error('新增失敗：' + response.message);
      }
    } catch (error) {
      console.error('新增身分組錯誤:', error);
      toast.error('新增身分組失敗');
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      color: group.color
    });
    setShowEditModal(true);
  };

  const handleUpdateGroup = async () => {
    if (!formData.name.trim()) {
      toast.error('請輸入身分組名稱');
      return;
    }

    try {
      const { updateUserGroup } = await import('../services/api');
      const response = await updateUserGroup(editingGroup.id, formData);
      if (response.success) {
        await loadUserGroups();
        setEditingGroup(null);
        editModal.handleClose();
        toast.success('身分組更新成功');
      } else {
        toast.error('更新失敗：' + response.message);
      }
    } catch (error) {
      console.error('更新身分組錯誤:', error);
      toast.error('更新身分組失敗');
    }
  };

  const confirmDeleteGroup = async () => {
    if (!showDeleteConfirm) return;

    try {
      const { deleteUserGroup } = await import('../services/api');
      const response = await deleteUserGroup(showDeleteConfirm.id);
      if (response.success) {
        await loadUserGroups();
        toast.success('身分組刪除成功');
      } else {
        toast.error('刪除失敗：' + response.message);
      }
    } catch (error) {
      console.error('刪除身分組錯誤:', error);
      toast.error('刪除身分組失敗');
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">身分組管理</h3>
          <p className="text-sm text-gray-600 mt-1">管理處室的用戶身分組別與權限層級</p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: '', description: '', color: '#3B82F6' });
            setShowAddModal(true);
          }}
          className="px-4 py-2 text-white rounded-lg shadow hover:shadow-lg transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          + 新增身分組
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userGroups.map(group => (
          <div key={group.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color }}
                ></div>
                <div>
                  <h4 className="font-medium text-gray-900">{group.name}</h4>
                  {group.description && (
                    <p className="text-xs text-gray-500 mt-1">{group.description}</p>
                  )}
                </div>
              </div>

            </div>
            
            <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
              <span>{group.memberCount || 0} 位成員</span>
              <span>{group.fileCount || 0} 個檔案</span>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEditGroup(group)}
                className="flex-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors cursor-pointer"
              >
                編輯
              </button>
              <button
                onClick={() => setShowDeleteConfirm(group)}
                className="flex-1 px-3 py-1.5 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
              >
                刪除
              </button>
            </div>
          </div>
        ))}
      </div>

      {userGroups.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p>尚未建立任何身分組</p>
        </div>
      )}

      {/* 新增身分組對話框 */}
      {addModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${addModal.animationClass}`}>
          <div className={`bg-white rounded-lg p-6 w-96 mx-4 ${addModal.contentAnimationClass}`}>
            <h3 className="text-lg font-semibold mb-4">新增身分組</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  身分組名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：主管、組A、組B"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="選填：簡單描述此身分組的用途"
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  顏色標識
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {colorOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, color: option.value })}
                      className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        formData.color === option.value
                          ? 'border-gray-800 ring-2 ring-offset-2 ring-gray-800'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                    >
                      {formData.color === option.value && (
                        <svg className="w-4 h-4 text-white mx-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={addModal.handleClose}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleAddGroup}
                className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯身分組對話框 */}
      {editModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${editModal.animationClass}`}>
          <div className={`bg-white rounded-lg p-6 w-96 mx-4 ${editModal.contentAnimationClass}`}>
            <h3 className="text-lg font-semibold mb-4">編輯身分組</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  身分組名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  顏色標識
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {colorOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, color: option.value })}
                      className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        formData.color === option.value
                          ? 'border-gray-800 ring-2 ring-offset-2 ring-gray-800'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                    >
                      {formData.color === option.value && (
                        <svg className="w-4 h-4 text-white mx-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={editModal.handleClose}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleUpdateGroup}
                className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        shouldRender={deleteModal.shouldRender}
        isClosing={deleteModal.isClosing}
        animationClass={deleteModal.animationClass}
        contentAnimationClass={deleteModal.contentAnimationClass}
        onClose={deleteModal.handleClose}
        onConfirm={confirmDeleteGroup}
        title="確認刪除"
        message={`確定要刪除身分組「${showDeleteConfirm?.name}」嗎？此操作無法復原。`}
        confirmText="刪除"
        cancelText="取消"
      />
    </div>
  );
}

export default Dashboard;
