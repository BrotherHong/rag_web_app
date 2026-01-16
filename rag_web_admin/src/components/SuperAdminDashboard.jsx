import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  logout, 
  getDepartments,
  addDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentStats,
  getUsers,
  getSettings,
  updateSettings,
  getSystemInfo,
  getAllActivities
} from '../services/api';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useToast } from '../contexts/ToastContext';
import DepartmentManagement from './superadmin/DepartmentManagement';
import UserManagement from './superadmin/UserManagement';
import SystemSettings from './superadmin/SystemSettings';
import ActivityLog from './superadmin/ActivityLog';
import GlobalOverview from './superadmin/GlobalOverview';
import QueryUserManagement from './QueryUserManagement';
import { getActivityConfig } from '../utils/activityConfig';

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentPage, setCurrentPage] = useState('overview'); // overview, departments, users, query-users, settings, activities
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // 活動記錄相關
  const [allActivities, setAllActivities] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('all'); // 'all' 或 departmentId
  
  // 系統設定相關
  const [systemSettings, setSystemSettings] = useState(null);
  const [tempSettings, setTempSettings] = useState(null); // 暫存修改
  const [systemInfo, setSystemInfo] = useState(null);
  const [activeSettingTab, setActiveSettingTab] = useState('ai-model'); // ai-model, rag, backup, system-info
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null); // 上次儲存時間
  
  // 處室相關的 state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(null);
  const [editingDept, setEditingDept] = useState(null);
  const [statsData, setStatsData] = useState(null);

  // 表單資料
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    color: '#3B82F6' // 預設藍色
  });

  // 可用的顏色選項
  const colorOptions = [
    { value: '#EF4444', label: '紅色' },
    { value: '#3B82F6', label: '藍色' },
    { value: '#10B981', label: '綠色' },
    { value: '#F59E0B', label: '黃色' },
    { value: '#8B5CF6', label: '紫色' },
    { value: '#EC4899', label: '粉色' },
    { value: '#6366F1', label: '靛藍' },
    { value: '#F97316', label: '橙色' },
  ];

  // 獲取使用者資訊
  const getUserInfo = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : { name: '系統管理員', username: 'SuperAdmin', role: 'SUPER_ADMIN' };
    } catch {
      return { name: '系統管理員', username: 'SuperAdmin', role: 'SUPER_ADMIN' };
    }
  };

  const user = getUserInfo();

  // 對話框動畫 Hooks
  const addModal = useModalAnimation(showAddModal, () => setShowAddModal(false));
  const editModal = useModalAnimation(showEditModal, () => setShowEditModal(false));
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));
  const statsModal = useModalAnimation(showStatsModal !== null, () => {
    setShowStatsModal(null);
    setStatsData(null);
  });

  // 載入處室列表
  useEffect(() => {
    loadDepartments();
    loadUsers();
    loadSystemSettings();
    loadSystemInfo();
    loadActivities();
  }, []);
  
  // 當切換處室篩選時重新載入活動
  useEffect(() => {
    if (currentPage === 'activities') {
      loadActivities();
    }
  }, [selectedDepartment, currentPage]);

  const loadDepartments = async () => {
    setIsLoading(true);
    try {
      const response = await getDepartments();
      if (response.success) {
        setDepartments(response.data);
      } else {
        console.error('載入處室失敗:', response.message);
      }
    } catch (error) {
      console.error('載入處室錯誤:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 載入使用者列表
  const loadUsers = async () => {
    try {
      const response = await getUsers();
      if (response.success) {
        setUsers(response.data);
      } else {
        console.error('載入使用者失敗:', response.message);
      }
    } catch (error) {
      console.error('載入使用者錯誤:', error);
    }
  };
  
  // 同時刷新使用者和處室列表（用於使用者 CRUD 操作後）
  const refreshUsersAndDepartments = async () => {
    await Promise.all([loadUsers(), loadDepartments()]);
  };
  
  // 載入系統設定
  const loadSystemSettings = async () => {
    try {
      const response = await getSettings();
      if (response.success) {
        setSystemSettings(response.data);
        setTempSettings(response.data); // 初始化暫存設定
        setHasUnsavedChanges(false);
      } else {
        console.error('載入系統設定失敗:', response.message);
      }
    } catch (error) {
      console.error('載入系統設定錯誤:', error);
    }
  };
  
  // 載入系統資訊
  const loadSystemInfo = async () => {
    try {
      const response = await getSystemInfo();
      if (response.success) {
        setSystemInfo(response.data);
      } else {
        console.error('載入系統資訊失敗:', response.message);
      }
    } catch (error) {
      console.error('載入系統資訊錯誤:', error);
    }
  };
  
  // 載入活動記錄
  const loadActivities = async () => {
    try {
      const deptId = selectedDepartment === 'all' ? null : parseInt(selectedDepartment);
      const response = await getAllActivities(deptId, 100);
      if (response.success) {
        setAllActivities(response.data);
      } else {
        console.error('載入活動記錄失敗:', response.message);
      }
    } catch (error) {
      console.error('載入活動記錄錯誤:', error);
    }
  };
  
  // 更新暫存設定
  const handleSettingsChange = (key, value) => {
    setTempSettings({ ...tempSettings, [key]: value });
    setHasUnsavedChanges(true);
  };
  
  // 儲存設定
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await updateSettings(tempSettings);
      if (response.success) {
        setSystemSettings(tempSettings);
        setHasUnsavedChanges(false);
        setLastSavedTime(new Date()); // 記錄儲存時間
        toast.success('設定已成功儲存!');
      } else {
        toast.error('儲存失敗：' + response.message);
      }
    } catch (error) {
      console.error('儲存設定錯誤:', error);
      toast.error('儲存設定失敗');
    } finally {
      setIsSavingSettings(false);
    }
  };
  
  // 取消變更
  const handleCancelSettings = () => {
    setTempSettings({ ...systemSettings }); // 使用深拷貝
    setHasUnsavedChanges(false);
  };

  // 處理登出
  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    try {
      await logout();
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('authChange'));
      navigate('/', { replace: true });
    } catch (error) {
      console.error('登出錯誤:', error);
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('authChange'));
      navigate('/', { replace: true });
    }
  };

  // 處理新增處室
  const handleAddDepartment = async () => {
    if (!formData.name.trim()) {
      toast.warning('請填寫處室名稱');
      return;
    }
    
    if (!formData.slug.trim()) {
      toast.warning('請輸入 URL 識別碼');
      return;
    }
    
    // 驗證 slug 格式（只允許小寫字母、數字和連字符）
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(formData.slug)) {
      toast.warning('URL 識別碼只能包含小寫字母、數字和連字符(-)');
      return;
    }

    try {
      const response = await addDepartment(formData);
      if (response.success) {
        await loadDepartments();
        addModal.handleClose();
        resetForm();
        toast.success('處室新增成功');
      } else {
        toast.error('新增失敗：' + response.message);
      }
    } catch (error) {
      console.error('新增處室錯誤:', error);
      toast.error('新增處室失敗');
    }
  };

  // 處理編輯處室
  const handleEditDepartment = async () => {
    if (!formData.name.trim()) {
      toast.warning('請填寫處室名稱');
      return;
    }

    try {
      const response = await updateDepartment(editingDept.id, formData);
      if (response.success) {
        await loadDepartments();
        editModal.handleClose();
        setEditingDept(null);
        resetForm();
        toast.success('處室更新成功');
      } else {
        toast.error('更新失敗：' + response.message);
      }
    } catch (error) {
      console.error('更新處室錯誤:', error);
      toast.error('更新處室失敗');
    }
  };

  // 處理刪除處室
  const handleDeleteDepartment = async (deptId) => {
    try {
      const response = await deleteDepartment(deptId);
      if (response.success) {
        await loadDepartments();
        deleteModal.handleClose();
        toast.success('處室刪除成功');
      } else {
        toast.error('刪除失敗：' + response.message);
      }
    } catch (error) {
      console.error('刪除處室錯誤:', error);
      toast.error('刪除處室失敗');
    }
  };

  // 開啟編輯對話框
  const openEditModal = (dept) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      slug: dept.slug,
      description: dept.description || '',
      color: dept.color
    });
    setShowEditModal(true);
  };

  // 進入處事管理頁面
  const enterDepartmentDashboard = (dept) => {
    // 暫存系統管理員的資訊
    const currentUser = getUserInfo();
    
    // 檢查是否已經有保存的 superAdminUser (防止重複進入代理模式)
    const existingSuperAdminUser = localStorage.getItem('superAdminUser');
    
    if (!existingSuperAdminUser) {
      // 首次進入代理模式,保存當前的系統管理員資訊
      // 確保存儲的是純 super_admin 身分（清除可能存在的任何處室相關屬性）
      const superAdminUser = {
        id: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
        role: 'SUPER_ADMIN'
        // 明確不包含 departmentId 和 departmentName
      };
      localStorage.setItem('superAdminUser', JSON.stringify(superAdminUser));
    }
    
    // 模擬處室管理員身分（保留原始 user id，token 不變）
    const tempUser = {
      id: currentUser.id, // 保留原始 user id
      username: currentUser.username,
      name: `${dept.name} 管理員 (系統管理員代理)`,
      role: 'ADMIN',
      departmentId: dept.id,
      departmentName: dept.name,
      isSuperAdminProxy: true, // 標記為系統管理員代理
      _originalRole: 'SUPER_ADMIN' // 保存原始角色
    };
    
    localStorage.setItem('user', JSON.stringify(tempUser));
    
    // 先導航，再非同步觸發事件，減少閃爍
    navigate('/dashboard', { replace: true });
    
    // 使用 setTimeout 確保導航完成後再觸發事件
    setTimeout(() => {
      window.dispatchEvent(new Event('authChange'));
    }, 0);
  };

  // 查看處室統計
  const viewStats = async (dept) => {
    try {
      const response = await getDepartmentStats(dept.id);
      if (response.success) {
        setStatsData(response.data);
        setShowStatsModal(dept);
      } else {
        toast.error('獲取統計資料失敗：' + response.message);
      }
    } catch (error) {
      console.error('獲取統計資料錯誤:', error);
      toast.error('獲取統計資料失敗');
    }
  };

  // 重置表單
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3B82F6' // 預設藍色
    });
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
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <div>
                  <h1 className="text-xl font-bold">AI 客服系統</h1>
                  <p className="text-xs text-red-100">系統管理後台</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user.name}</p>
                <div className="flex items-center justify-end space-x-2">
                  <p className="text-xs text-red-100">{user.username}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                    系統管理員
                  </span>
                </div>
              </div>
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

      {/* 主要內容區域 */}
      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* 頁籤導航 */}
          <div className="flex space-x-4 mb-8 border-b border-gray-200">
            <button
              onClick={() => setCurrentPage('overview')}
              className={`px-6 py-3 font-medium transition-all cursor-pointer relative ${
                currentPage === 'overview'
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              style={currentPage === 'overview' ? {
                backgroundColor: 'var(--ncku-red)',
                borderRadius: '8px 8px 0 0'
              } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" />
                </svg>
                <span>全局總攬</span>
              </div>
            </button>
            <button
              onClick={() => setCurrentPage('departments')}
              className={`px-6 py-3 font-medium transition-all cursor-pointer relative ${
                currentPage === 'departments'
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              style={currentPage === 'departments' ? {
                backgroundColor: 'var(--ncku-red)',
                borderRadius: '8px 8px 0 0'
              } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>處室管理</span>
              </div>
            </button>
            <button
              onClick={() => setCurrentPage('users')}
              className={`px-6 py-3 font-medium transition-all cursor-pointer relative ${
                currentPage === 'users'
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              style={currentPage === 'users' ? {
                backgroundColor: 'var(--ncku-red)',
                borderRadius: '8px 8px 0 0'
              } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>使用者管理</span>
              </div>
            </button>
            <button
              onClick={() => setCurrentPage('query-users')}
              className={`px-6 py-3 font-medium transition-all cursor-pointer relative ${
                currentPage === 'query-users'
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              style={currentPage === 'query-users' ? {
                backgroundColor: 'var(--ncku-red)',
                borderRadius: '8px 8px 0 0'
              } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>查詢用戶</span>
              </div>
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className={`px-6 py-3 font-medium transition-all cursor-pointer relative ${
                currentPage === 'settings'
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              style={currentPage === 'settings' ? {
                backgroundColor: 'var(--ncku-red)',
                borderRadius: '8px 8px 0 0'
              } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>系統設定</span>
              </div>
            </button>
            <button
              onClick={() => setCurrentPage('activities')}
              className={`px-6 py-3 font-medium transition-all cursor-pointer relative ${
                currentPage === 'activities'
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              style={currentPage === 'activities' ? {
                backgroundColor: 'var(--ncku-red)',
                borderRadius: '8px 8px 0 0'
              } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <span>活動記錄</span>
              </div>
            </button>
          </div>

          {/* 處室管理頁面 */}
          {currentPage === 'overview' && (
            <GlobalOverview />
          )}
          {currentPage === 'departments' && (
            <DepartmentManagement 
              departments={departments}
              onRefresh={loadDepartments}
              isLoading={isLoading}
            />
          )}

          {/* 使用者管理頁面 */}
          {currentPage === 'users' && (
            <UserManagement 
              users={users}
              departments={departments}
              onRefresh={refreshUsersAndDepartments}
              isLoading={isLoading}
            />
          )}

          {/* 查詢用戶管理頁面 */}
          {currentPage === 'query-users' && (
            <QueryUserManagement />
          )}

          {/* 系統設定頁面 */}
          {currentPage === 'settings' && (
            <SystemSettings 
              systemSettings={systemSettings}
              systemInfo={systemInfo}
              onSettingsUpdate={handleSettingsChange}
              onSettingsSave={handleSaveSettings}
              onSettingsCancel={handleCancelSettings}
            />
          )}

          {/* 活動記錄頁面 */}
          {currentPage === 'activities' && (
            <ActivityLog 
              activities={allActivities}
              departments={departments}
              selectedDepartment={selectedDepartment}
              onDepartmentChange={setSelectedDepartment}
            />
          )}
        </div>
      </main>

      {/* 新增處室對話框 */}
      {addModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${addModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-lg ${addModal.contentAnimationClass}`}>
            <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--ncku-red)' }}>新增處室</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">處室名稱 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入處室名稱"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">URL 識別碼 (Slug) *</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none font-mono text-sm"
                  placeholder="例如：hr, acc, it"
                />
                <p className="mt-1 text-xs text-gray-500">
                  用於網址：/{formData.slug || 'slug'}（只能使用小寫字母、數字和連字符）
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">處室描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入處室描述"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">選擇顏色</label>
                <div className="grid grid-cols-4 gap-2">
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        formData.color === color.value 
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
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  addModal.handleClose();
                  resetForm();
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleAddDepartment}
                disabled={!formData.name.trim()}
                className="px-6 py-2 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯處室對話框 */}
      {editModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${editModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-lg ${editModal.contentAnimationClass}`}>
            <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--ncku-red)' }}>編輯處室</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">處室名稱 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入處室名稱"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">處室描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入處室描述"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">選擇顏色</label>
                <div className="grid grid-cols-4 gap-2">
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        formData.color === color.value 
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
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  editModal.handleClose();
                  setEditingDept(null);
                  resetForm();
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleEditDepartment}
                disabled={!formData.name.trim()}
                className="px-6 py-2 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認對話框 */}
      {deleteModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${deleteModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-sm ${deleteModal.contentAnimationClass}`}>
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-center mb-2">確認刪除</h3>
            <p className="text-gray-600 text-center mb-6">
              確定要刪除「{showDeleteConfirm.name}」嗎？<br/>
              <span className="text-sm text-red-600">此操作無法復原，請確認該處室已無使用者和檔案。</span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={deleteModal.handleClose}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => {
                  handleDeleteDepartment(showDeleteConfirm.id);
                }}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 統計資料對話框 */}
      {statsModal.shouldRender && statsData && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${statsModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto ${statsModal.contentAnimationClass}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold" style={{ color: 'var(--ncku-red)' }}>
                {showStatsModal.name} - 統計資料
              </h3>
              <button
                onClick={statsModal.handleClose}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* 總覽 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">總檔案數</p>
                  <p className="text-3xl font-bold text-blue-600">{statsData.totalFiles}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">使用者數</p>
                  <p className="text-3xl font-bold text-green-600">{statsData.totalUsers}</p>
                </div>
              </div>

              {/* 分類統計 */}
              <div>
                <h4 className="font-semibold mb-3 text-gray-900">檔案分類統計</h4>
                <div className="space-y-2">
                  {Object.entries(statsData.filesByCategory).map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700">{category}</span>
                      <span className="font-semibold text-gray-900">{count} 個檔案</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 最近活動 */}
              <div>
                <h4 className="font-semibold mb-3 text-gray-900">最近活動</h4>
                {statsData.recentActivities.length > 0 ? (
                  <div className="space-y-2">
                    {statsData.recentActivities.map((activity, index) => {
                      const config = getActivityConfig(activity.type?.toLowerCase() || activity.type);
                      const extractTarget = (description) => {
                        const colonIndex = description?.indexOf(':');
                        if (colonIndex > -1) {
                          return description.substring(colonIndex + 1).trim();
                        }
                        return description || '系統操作';
                      };

                      return (
                        <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: config.bgColor }}
                          >
                            <svg 
                              className="w-4 h-4" 
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
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">
                              {config.label}
                            </p>
                            <p className="text-sm text-gray-700 mb-1">
                              {extractTarget(activity.description)}
                            </p>
                            <p className="text-xs text-gray-500">
                              <span className="inline-flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {activity.user}
                              </span>
                              <span className="mx-2">•</span>
                              <span>{new Date(activity.createdAt).toLocaleString('zh-TW')}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">暫無活動記錄</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminDashboard;
