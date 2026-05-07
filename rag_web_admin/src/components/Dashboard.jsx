import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  logout, 
  getStatistics, 
  getRecentActivities,
  runNoResultInsights,
  getPopularQueries,
  getQueryHistory,
  getCategoriesWithDetails,
  addCategory,
  deleteCategory,
  getFaqs,
  addFaq,
  updateFaq,
  deleteFaq,
  toggleFaqStatus,
  getCurrentDepartmentLoginMethods,
  updateCurrentDepartmentLoginMethods,
  getAssistantSettings,
  updateAssistantSettings,
  uploadGreetingImage,
  deleteGreetingImage,
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
  const [kbSearchTerm, setKbSearchTerm] = useState('');
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
              {user.departmentSlug && (
                <a
                  href={`${window.location.origin}/query/${user.departmentSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>前往問答頁面</span>
                </a>
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
              onClick={() => setCurrentPage('query-analytics')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'query-analytics'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'query-analytics' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <span className="font-medium">查詢分析</span>
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
              <span className="font-medium">問答設定</span>
            </button>

            <button
              onClick={() => setCurrentPage('dept-settings')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                currentPage === 'dept-settings'
                  ? 'text-white shadow-lg'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              style={currentPage === 'dept-settings' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-medium">處室設定</span>
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
          {currentPage === 'knowledge-base' && <KnowledgeBase initialSearch={kbSearchTerm} onSearchConsumed={() => setKbSearchTerm('')} />}
          {/* UploadFiles 保持 mounted 避免切換頁面時狀態遺失，用 hidden 控制顯示 */}
          <div className={currentPage === 'upload-files' ? '' : 'hidden'}>
            <UploadFiles 
              onNavigateToKnowledgeBase={(searchTerm) => {
                setKbSearchTerm(searchTerm || '');
                setCurrentPage('knowledge-base');
              }}
            />
          </div>
          {currentPage === 'dashboard' && <DashboardHome />}
          {currentPage === 'dept-settings' && <DepartmentSettings />}
          {currentPage === 'query-users' && <QueryUserManagement />}
          {currentPage === 'query-analytics' && <QueryAnalytics />}
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

function QueryAnalytics() {
  const [insightDays, setInsightDays] = useState(30);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [noResultInsights, setNoResultInsights] = useState(null);
  const [popularDays, setPopularDays] = useState(30);
  const [popularQueries, setPopularQueries] = useState(null);
  const [popularHasRun, setPopularHasRun] = useState(false);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState('');
  const [history, setHistory] = useState({ items: [], total: 0, page: 1, pages: 0 });
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDays, setHistoryDays] = useState('');
  const [historyHasRun, setHistoryHasRun] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };

  const resetPopularResults = () => {
    setPopularQueries(null);
    setPopularHasRun(false);
    setPopularError('');
  };

  const resetHistoryResults = () => {
    setHistory({ items: [], total: 0, page: 1, pages: 0 });
    setHistoryPage(1);
    setHistoryHasRun(false);
    setHistoryError('');
  };

  const loadPopularQueries = async () => {
    setPopularLoading(true);
    setPopularError('');
    try {
      const response = await getPopularQueries({ days: popularDays, limit: 10 });
      if (!response.success) {
        setPopularError(response.message || '取得熱門查詢失敗');
        return;
      }
      setPopularHasRun(true);
      setPopularQueries(response.data || null);
    } catch (error) {
      console.error('Load popular queries failed:', error);
      setPopularError('取得熱門查詢失敗，請稍後再試');
    } finally {
      setPopularLoading(false);
    }
  };

  const loadQueryHistory = async (page = 1) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await getQueryHistory({
        page,
        limit: 20,
        search: historySearch.trim(),
        days: historyDays ? parseInt(historyDays, 10) : undefined
      });
      if (!response.success) {
        setHistoryError(response.message || '取得歷史查詢失敗');
        return;
      }
      setHistoryHasRun(true);
      setHistoryPage(page);
      setHistory(response.data || { items: [], total: 0, page, pages: 0 });
    } catch (error) {
      console.error('Load query history failed:', error);
      setHistoryError('取得歷史查詢失敗，請稍後再試');
    } finally {
      setHistoryLoading(false);
    }
  };

  const runNoResultTopQuestions = async () => {
    setInsightLoading(true);
    setInsightError('');
    try {
      const response = await runNoResultInsights({
        days: insightDays,
        top_n: 10,
        similarity_threshold: 0.84,
        min_cluster_count: 1,
        max_unique_questions: 500,
        use_llm_refine: false
      });

      if (!response.success) {
        setInsightError(response.message || '彙整失敗');
        return;
      }

      setNoResultInsights(response.data || null);
    } catch (error) {
      console.error('Run no-result insight failed:', error);
      setInsightError('彙整失敗，請稍後再試');
    } finally {
      setInsightLoading(false);
    }
  };

  const handleHistorySearch = (e) => {
    e.preventDefault();
    loadQueryHistory(1);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--ncku-red)' }}>
        查詢分析
      </h2>

      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold">無結果問題 Top 10</h3>
            <p className="text-sm text-gray-500 mt-1">針對「沒有找到相關資訊」的查詢做語義彙整，供後續補文件優先處理。</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={insightDays}
              onChange={(e) => setInsightDays(parseInt(e.target.value, 10))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={insightLoading}
            >
              <option value={7}>近 7 天</option>
              <option value={14}>近 14 天</option>
              <option value={30}>近 30 天</option>
              <option value={90}>近 90 天</option>
            </select>

            <button
              onClick={runNoResultTopQuestions}
              disabled={insightLoading}
              className="px-4 py-2 rounded-lg text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: 'var(--ncku-red)' }}
            >
              {insightLoading ? '彙整中...' : '手動彙整'}
            </button>
          </div>
        </div>

        {insightError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {insightError}
          </div>
        )}

        {noResultInsights?.meta && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500">無結果查詢總數</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{noResultInsights.meta.total_no_result_queries || 0}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500">無結果唯一問題數</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{noResultInsights.meta.unique_no_result_questions || 0}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500">語義群組數</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{noResultInsights.meta.clustered_candidates || 0}</div>
            </div>
          </div>
        )}

        {noResultInsights?.items?.length > 0 ? (
          <div className="space-y-3">
            {noResultInsights.items.map((item, idx) => (
              <div key={`${item.question}-${idx}`} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-gray-900">#{idx + 1} {item.question}</div>
                  <div className="text-sm font-bold text-red-700 whitespace-nowrap">{item.count} 次</div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  最後詢問時間：{formatDateTime(item.last_asked_at)}
                </div>
                {item.sample_questions?.length > 1 && (
                  <div className="mt-2 text-sm text-gray-700">
                    相似問法：{item.sample_questions.slice(0, 3).join(' ｜ ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-2">
            尚未執行彙整，或指定期間內沒有「無相關資訊」查詢。
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold">最近熱門查詢</h3>
            <p className="text-sm text-gray-500 mt-1">不分是否有答案，依相同查詢文字統計最高次數。</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={popularDays}
              onChange={(e) => {
                setPopularDays(parseInt(e.target.value, 10));
                resetPopularResults();
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={popularLoading}
            >
              <option value={7}>近 7 天</option>
              <option value={14}>近 14 天</option>
              <option value={30}>近 30 天</option>
              <option value={90}>近 90 天</option>
            </select>
            <button
              onClick={loadPopularQueries}
              disabled={popularLoading}
              className="px-4 py-2 rounded-lg text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: 'var(--ncku-red)' }}
            >
              {popularLoading ? '彙整中...' : '手動彙整'}
            </button>
          </div>
        </div>

        {popularError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {popularError}
          </div>
        )}

        {popularLoading ? (
          <div className="text-sm text-gray-500 py-2">載入中...</div>
        ) : popularQueries?.items?.length > 0 ? (
          <div className="space-y-3">
            {popularQueries.items.map((item, idx) => (
              <div key={`${item.normalized_query}-${idx}`} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-gray-900">#{idx + 1} {item.query}</div>
                  <div className="text-sm font-bold text-blue-700 whitespace-nowrap">{item.count} 次</div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  首次：{formatDateTime(item.first_asked_at)} ｜ 最近：{formatDateTime(item.last_asked_at)}
                </div>
              </div>
            ))}
          </div>
        ) : popularHasRun ? (
          <div className="text-sm text-gray-500 py-2">指定期間內尚無查詢紀錄。</div>
        ) : (
          <div className="text-sm text-gray-500 py-2">尚未執行彙整。</div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold">歷史查詢</h3>
            <p className="text-sm text-gray-500 mt-1">查看所有查詢、回覆、來源數與處理時間。</p>
          </div>

          <form onSubmit={handleHistorySearch} className="flex flex-col sm:flex-row gap-3">
            <select
              value={historyDays}
              onChange={(e) => {
                setHistoryDays(e.target.value);
                resetHistoryResults();
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={historyLoading}
            >
              <option value="">全部時間</option>
              <option value="7">近 7 天</option>
              <option value="30">近 30 天</option>
              <option value="90">近 90 天</option>
            </select>
            <input
              type="text"
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                resetHistoryResults();
              }}
              placeholder="搜尋問題或回覆"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[220px]"
            />
            <button
              type="submit"
              disabled={historyLoading}
              className="px-4 py-2 rounded-lg text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: 'var(--ncku-red)' }}
            >
              {historyLoading ? '彙整中...' : '手動彙整'}
            </button>
          </form>
        </div>

        {historyError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {historyError}
          </div>
        )}

        {historyLoading ? (
          <div className="text-sm text-gray-500 py-2">載入中...</div>
        ) : history.items.length > 0 ? (
          <div className="space-y-4">
            {history.items.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div className="font-semibold text-gray-900">{item.query}</div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(item.created_at)}</div>
                </div>
                <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap line-clamp-4">{item.answer}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-3">
                  <span>來源：{item.source_count || 0}</span>
                  <span>處理時間：{Number(item.processing_time || 0).toFixed(2)} 秒</span>
                  <span>Token：{item.tokens_used || 0}</span>
                  {item.query_user && <span>查詢用戶：{item.query_user.full_name || item.query_user.username}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : historyHasRun ? (
          <div className="text-sm text-gray-500 py-2">目前沒有符合條件的歷史查詢。</div>
        ) : (
          <div className="text-sm text-gray-500 py-2">尚未執行彙整。</div>
        )}

        {historyHasRun && (
        <div className="flex items-center justify-between mt-5 text-sm text-gray-600">
          <div>共 {history.total || 0} 筆</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadQueryHistory(Math.max(1, historyPage - 1))}
              disabled={historyLoading || historyPage <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              上一頁
            </button>
            <span>第 {history.page || historyPage} / {history.pages || 1} 頁</span>
            <button
              onClick={() => loadQueryHistory(historyPage + 1)}
              disabled={historyLoading || historyPage >= (history.pages || 1)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              下一頁
            </button>
          </div>
        </div>
        )}
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

// 問答設定頁面組件（含助手設定 + FAQ 管理）
function FaqManagement() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('assistant'); // 'assistant' | 'faq'

  // === 助手設定 ===
  const [assistantSettings, setAssistantSettings] = useState({
    assistant_name: null,
    assistant_style: null,
    greeting_message: null,
    greeting_image: null,
    enable_direct_query: true,
  });

  const stylePresets = [
    { label: '親切口語', value: '親切、活潑、口語化，語氣輕鬆有溫度，用自然段落回答，像在跟同事聊天解釋，避免過多條列' },
    { label: '正式精準', value: '正式、精準，回答完整且結構清晰，適合公文查詢' },
    { label: '簡潔直接', value: '精簡，直接給答案，不加多餘解釋' },
  ];
  const [assistantDefaults, setAssistantDefaults] = useState({
    assistant_name: '',
    greeting_message: '',
  });
  const [assistantLoading, setAssistantLoading] = useState(true);
  const [assistantSaving, setAssistantSaving] = useState(false);
  const fileInputRef = useRef(null);
  const [imageUploading, setImageUploading] = useState(false);

  // === FAQ ===
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
    loadAssistantSettings();
    loadFaqs();
  }, []);

  // === 助手設定方法 ===
  const loadAssistantSettings = async () => {
    setAssistantLoading(true);
    try {
      const response = await getAssistantSettings();
      if (response.success) {
        const { defaults, ...settings } = response.data;
        setAssistantSettings(settings);
        if (defaults) setAssistantDefaults(defaults);
      }
    } catch (error) {
      console.error('載入助手設定錯誤:', error);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleSaveAssistantSettings = async () => {
    setAssistantSaving(true);
    try {
      const response = await updateAssistantSettings({
        assistant_name: assistantSettings.assistant_name?.trim() || null,
        assistant_style: assistantSettings.assistant_style?.trim() || null,
        greeting_message: assistantSettings.greeting_message?.trim() || null,
        enable_direct_query: assistantSettings.enable_direct_query,
      });
      if (response.success) {
        const { defaults, ...settings } = response.data;
        setAssistantSettings(settings);
        if (defaults) setAssistantDefaults(defaults);
        toast.success('助手設定已儲存');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('儲存失敗');
    } finally {
      setAssistantSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 前端驗證檔案大小
    if (file.size > 5 * 1024 * 1024) {
      toast.error('圖片大小不可超過 5MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImageUploading(true);
    try {
      const response = await uploadGreetingImage(file);
      if (response.success) {
        setAssistantSettings(prev => ({ ...prev, greeting_image: response.data.greeting_image }));
        toast.success('圖片上傳成功');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('上傳失敗');
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageDelete = async () => {
    try {
      const response = await deleteGreetingImage();
      if (response.success) {
        setAssistantSettings(prev => ({ ...prev, greeting_image: null }));
        toast.success('圖片已刪除');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('刪除失敗');
    }
  };

  // === FAQ 方法 ===

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
      {/* 頁面標題 */}
      <div>
        <h3 className="text-lg font-semibold">問答設定</h3>
        <p className="text-sm text-gray-600 mt-1">管理助手顯示設定與常見問題</p>
      </div>

      {/* Tab 切換 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('assistant')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'assistant'
              ? 'border-current text-[var(--ncku-red)]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          助手設定
        </button>
        <button
          onClick={() => setActiveTab('faq')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'faq'
              ? 'border-current text-[var(--ncku-red)]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          常見問題
        </button>
      </div>

      {/* === 助手設定 Tab === */}
      {activeTab === 'assistant' && (
        <div className="space-y-6">
          {assistantLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
                     style={{ color: 'var(--ncku-red)' }}></div>
                <p className="mt-4 text-gray-600">載入中...</p>
              </div>
            </div>
          ) : (
            <>
              {/* 助手名稱 */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700">助手名稱</label>
                  {assistantSettings.assistant_name === null && (
                    <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">預設</span>
                  )}
                </div>
                <input
                  type="text"
                  value={assistantSettings.assistant_name ?? assistantDefaults.assistant_name}
                  onChange={(e) => setAssistantSettings(prev => ({ ...prev, assistant_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">清空後儲存即恢復預設名稱</p>
              </div>

              {/* 助手回答風格 */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700">回答風格</label>
                </div>
                {(() => {
                  const currentValue = assistantSettings.assistant_style ?? '';
                  const isCustom = assistantSettings.assistant_style !== null && !stylePresets.some(p => p.value === currentValue);
                  return (
                    <>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {stylePresets.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setAssistantSettings(prev => ({ ...prev, assistant_style: preset.value }))}
                            className={`px-3 py-1.5 text-xs rounded-full border cursor-pointer transition-colors ${
                              currentValue === preset.value
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setAssistantSettings(prev => ({ ...prev, assistant_style: '' }))}
                          className={`px-3 py-1.5 text-xs rounded-full border cursor-pointer transition-colors ${
                            isCustom
                              ? 'bg-amber-50 border-amber-300 text-amber-700'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          自訂
                        </button>
                      </div>
                      <textarea
                        value={currentValue}
                        onChange={(e) => setAssistantSettings(prev => ({ ...prev, assistant_style: e.target.value }))}
                        rows={2}
                        placeholder="描述助手的回答風格"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none resize-none"
                      />
                    </>
                  );
                })()}
                <p className="text-xs text-gray-500 mt-1">選擇預設風格或直接編輯文字自訂，留空則由模型自行決定風格</p>
              </div>

              {/* 問候語 */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700">問候語</label>
                  {assistantSettings.greeting_message === null && (
                    <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">預設</span>
                  )}
                </div>
                <textarea
                  value={assistantSettings.greeting_message ?? assistantDefaults.greeting_message}
                  onChange={(e) => setAssistantSettings(prev => ({ ...prev, greeting_message: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">清空後儲存即恢復預設問候語</p>
              </div>

              {/* 歡迎圖片 */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">歡迎圖片</label>
                <p className="text-xs text-gray-500 mb-3">可選，圖片會顯示在問候語文字下方（支援 JPG、PNG、GIF、WebP，最大 5MB）</p>
                
                {assistantSettings.greeting_image ? (
                  <div className="space-y-3">
                    <div className="relative inline-block">
                      <img
                        src={`/api/public/greeting-image/${JSON.parse(localStorage.getItem('user'))?.departmentId}`}
                        alt="歡迎圖片"
                        className="max-w-md max-h-48 rounded-lg border border-gray-200 object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUploading}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                      >
                        更換圖片
                      </button>
                      <button
                        onClick={handleImageDelete}
                        className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        移除圖片
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 text-gray-600 cursor-pointer disabled:opacity-50"
                  >
                    {imageUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">上傳中...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm">上傳圖片</span>
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {/* AI 通用知識回答 */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">「改以 AI 通用知識回答」功能</label>
                    <p className="text-xs text-gray-500 mt-1">開啟後，使用者在 AI 回覆下方可點擊此按鈕取得通用知識回答</p>
                  </div>
                  <button
                    onClick={() => setAssistantSettings(prev => ({ ...prev, enable_direct_query: !prev.enable_direct_query }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                      assistantSettings.enable_direct_query ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      assistantSettings.enable_direct_query ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* 儲存按鈕 */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveAssistantSettings}
                  disabled={assistantSaving}
                  className="px-6 py-2 text-white rounded-lg shadow hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--ncku-red)' }}
                >
                  {assistantSaving ? '儲存中...' : '儲存設定'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* === 常見問題 Tab === */}
      {activeTab === 'faq' && (
        <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">管理本處室的常見問題，這些問題會顯示在使用者查詢頁面</p>
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
      )}
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

function LoginMethodSettings() {
  const toast = useToast();
  const [selectedMethods, setSelectedMethods] = useState(['normal', 'success_portal']);
  const [departmentName, setDepartmentName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const options = [
    { key: 'normal', label: '一般登入', hint: '帳號密碼登入' },
    { key: 'success_portal', label: '成功入口登入', hint: '校內成功入口驗證' },
    { key: 'google', label: 'Google 登入', hint: 'Google OAuth 登入' },
  ];

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await getCurrentDepartmentLoginMethods();
        if (response.success) {
          setSelectedMethods(response.data.loginMethods || ['normal', 'success_portal']);
          setDepartmentName(response.data.departmentName || '');
        } else {
          toast.error(response.message || '載入登入方式失敗');
        }
      } catch (error) {
        console.error('載入登入方式錯誤:', error);
        toast.error('載入登入方式失敗');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [toast]);

  const toggle = (key) => {
    setSelectedMethods((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ));
  };

  const handleSave = async () => {
    if (selectedMethods.length === 0) {
      toast.warning('請至少保留一種登入方式');
      return;
    }

    setIsSaving(true);
    try {
      const response = await updateCurrentDepartmentLoginMethods(selectedMethods);
      if (response.success) {
        setSelectedMethods(response.data.loginMethods || selectedMethods);
        toast.success('登入方式已更新，預設身分組已同步');
      } else {
        toast.error(response.message || '更新登入方式失敗');
      }
    } catch (error) {
      console.error('更新登入方式錯誤:', error);
      toast.error('更新登入方式失敗');
    } finally {
      setIsSaving(false);
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
      <div>
        <h3 className="text-lg font-semibold">登入方式設定</h3>
        <p className="text-sm text-gray-600 mt-1">
          {departmentName ? `${departmentName}：` : ''}調整查詢站可用的登入方式，系統會同步增減預設身分組。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {options.map((option) => {
          const checked = selectedMethods.includes(option.key);
          return (
            <label
              key={option.key}
              className={`border rounded-xl p-4 cursor-pointer transition-all ${
                checked ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{option.label}</p>
                  <p className="text-sm text-gray-500 mt-1">{option.hint}</p>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option.key)}
                  className="w-4 h-4 mt-1 cursor-pointer"
                />
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <p className="text-sm text-gray-600">至少需保留一種登入方式</p>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          {isSaving ? '儲存中...' : '儲存設定'}
        </button>
      </div>
    </div>
  );
}

function DepartmentSettings() {
  const [activeTab, setActiveTab] = useState('categories');

  const tabs = [
    { key: 'categories', label: '分類管理' },
    { key: 'user-groups', label: '身分組' },
    { key: 'login-methods', label: '登入方式' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">處室設定</h2>
        <p className="text-sm text-gray-500 mt-1">管理此處室的分類、身分組與登入方式</p>
      </div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'border-red-700 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              style={activeTab === tab.key ? { borderColor: 'var(--ncku-red)', color: 'var(--ncku-red)' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      {activeTab === 'categories' && <CategoryManagement />}
      {activeTab === 'user-groups' && <UserGroupManagement />}
      {activeTab === 'login-methods' && <LoginMethodSettings />}
    </div>
  );
}

export default Dashboard;
