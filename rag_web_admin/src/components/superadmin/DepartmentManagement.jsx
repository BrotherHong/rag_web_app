/**
 * Department Management Component
 * 處室管理組件 - 負責處室的新增、編輯、刪除和顯示
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDepartment,
  updateDepartment,
  deleteDepartment,
  getAdminGroups,
  createAdminGroup,
  updateAdminGroup,
  deleteAdminGroup
} from '../../services/api';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';

const LOGIN_METHOD_OPTIONS = [
  { key: 'normal', label: '一般登入', hint: '帳號密碼登入' },
  { key: 'success_portal', label: '成功入口登入', hint: '校內成功入口驗證' },
  { key: 'google', label: 'Google 登入', hint: 'Google OAuth 登入' },
];

function DepartmentManagement({ departments, onRefresh, isLoading }) {
  const navigate = useNavigate();
  const toast = useToast();
  
  // 處室相關的 state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingDept, setEditingDept] = useState(null);

  // 對話框動畫 Hooks
  const addModal = useModalAnimation(showAddModal, () => setShowAddModal(false));
  const editModal = useModalAnimation(showEditModal, () => setShowEditModal(false));
  const deleteConfirmModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));

  // 表單資料
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    color: '#3B82F6', // 預設藍色
    external_api_key: '',
    login_methods: ['normal', 'success_portal']
  });

  // === 管理組織相關 state ===
  const [showAdminGroupModal, setShowAdminGroupModal] = useState(null); // 存放 department 物件
  const [adminGroups, setAdminGroups] = useState([]);
  const [adminGroupLoading, setAdminGroupLoading] = useState(false);
  const [showAdminGroupForm, setShowAdminGroupForm] = useState(false);
  const [editingAdminGroup, setEditingAdminGroup] = useState(null);
  const [deleteAdminGroup_confirm, setDeleteAdminGroupConfirm] = useState(null);
  const [adminGroupFormData, setAdminGroupFormData] = useState({ name: '', description: '', color: '#3B82F6' });

  const adminGroupModal = useModalAnimation(showAdminGroupModal !== null, () => setShowAdminGroupModal(null));
  const deleteAdminGroupConfirmModal = useModalAnimation(deleteAdminGroup_confirm !== null, () => setDeleteAdminGroupConfirm(null));

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

  // 打開編輯 Modal
  const openEditModal = (dept) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      slug: dept.slug,
      description: dept.description || '',
      color: dept.color,
      external_api_key: '', // 編輯時不顯示已儲存的 key，只顯示是否已設定
      login_methods: dept.login_methods || ['normal', 'success_portal']
    });
    setShowEditModal(true);
  };

  // 重置表單
  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      color: '#3B82F6', // 預設藍色
      external_api_key: '',
      login_methods: ['normal', 'success_portal']
    });
  };

  const toggleLoginMethod = (methodKey) => {
    const methods = formData.login_methods || [];
    const isChecked = methods.includes(methodKey);
    
    // Prevent unchecking if it's the last remaining method
    if (isChecked && methods.length === 1) {
      return;
    }

    const updated = isChecked
      ? methods.filter((m) => m !== methodKey)
      : [...methods, methodKey];

    setFormData({
      ...formData,
      login_methods: updated
    });
  };

  // 處理新增處室
  const handleAddDepartment = async () => {
    if (!formData.name.trim()) {
      toast.warning('請輸入處室名稱');
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

    if (!formData.login_methods || formData.login_methods.length === 0) {
      toast.warning('請至少選擇一種登入方式');
      return;
    }

    try {
      // 若 external_api_key 為空字串，不傳遞該欄位
      const addData = { ...formData };
      if (!addData.external_api_key.trim()) {
        delete addData.external_api_key;
      }
      const response = await addDepartment(addData);
      if (response.success) {
        await onRefresh();
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
      toast.warning('請輸入處室名稱');
      return;
    }

    if (!formData.login_methods || formData.login_methods.length === 0) {
      toast.warning('請至少選擇一種登入方式');
      return;
    }

    try {
      // 若 external_api_key 為空字串，不傳遞該欄位（保留原本設定）
      const updateData = { ...formData };
      if (!updateData.external_api_key.trim()) {
        delete updateData.external_api_key;
      }
      const response = await updateDepartment(editingDept.id, updateData);
      if (response.success) {
        await onRefresh();
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
        await onRefresh();
        // deleteConfirmModal.handleClose(); // 移除：讓 ConfirmDialog 自己處理關閉
        toast.success('處室刪除成功');
      } else {
        toast.error('刪除失敗：' + response.message);
      }
    } catch (error) {
      console.error('刪除處室錯誤:', error);
      toast.error('刪除處室失敗');
    }
  };

  // 進入處室管理後台
  const enterDepartmentDashboard = (dept) => {
    // 暫存系統管理員的資訊
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
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
    
    // 建立一個臨時的處室管理員身分（保留原始 id, token 不變）
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

  // === 管理組織功能 ===
  const openAdminGroupModal = async (dept) => {
    setShowAdminGroupModal(dept);
    setAdminGroupLoading(true);
    const res = await getAdminGroups(dept.id);
    if (res.success) {
      setAdminGroups(res.data);
    } else {
      toast.error(res.message);
    }
    setAdminGroupLoading(false);
  };

  const refreshAdminGroups = async () => {
    if (!showAdminGroupModal) return;
    const res = await getAdminGroups(showAdminGroupModal.id);
    if (res.success) setAdminGroups(res.data);
  };

  const resetAdminGroupForm = () => {
    setAdminGroupFormData({ name: '', description: '', color: '#3B82F6' });
    setEditingAdminGroup(null);
    setShowAdminGroupForm(false);
  };

  const handleSaveAdminGroup = async () => {
    if (!adminGroupFormData.name.trim()) {
      toast.warning('請輸入組織名稱');
      return;
    }
    if (editingAdminGroup) {
      const res = await updateAdminGroup(editingAdminGroup.id, adminGroupFormData);
      if (res.success) {
        toast.success('管理組織已更新');
        await refreshAdminGroups();
        resetAdminGroupForm();
      } else {
        toast.error(res.message);
      }
    } else {
      const res = await createAdminGroup({
        ...adminGroupFormData,
        department_id: showAdminGroupModal.id,
      });
      if (res.success) {
        toast.success('管理組織已建立');
        await refreshAdminGroups();
        resetAdminGroupForm();
      } else {
        toast.error(res.message);
      }
    }
  };

  const handleDeleteAdminGroup = async (groupId) => {
    const res = await deleteAdminGroup(groupId);
    if (res.success) {
      toast.success('管理組織已刪除');
      await refreshAdminGroups();
    } else {
      toast.error(res.message);
    }
  };

  const adminGroupColorOptions = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
    '#8B5CF6', '#EC4899', '#6366F1', '#F97316',
  ];

  // 複製查詢網址
  const handleCopyUrl = async (slug) => {
    const url = `${window.location.origin}/query/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('查詢網址已複製');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        toast.success('查詢網址已複製');
      } catch {
        toast.error('複製失敗，請手動複製');
      }
      document.body.removeChild(textarea);
    }
  };

  return (
    <>
      {/* 標題和新增按鈕 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold" style={{ color: 'var(--ncku-red)' }}>
            處室管理
          </h2>
          <p className="text-sm sm:text-base text-gray-600 mt-2">管理各處室的 AI 客服後台系統</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base text-white rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer font-medium flex items-center space-x-2"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>新增處室</span>
        </button>
      </div>

      {/* 處室卡片列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
                 style={{ color: 'var(--ncku-red)' }}>
            </div>
            <p className="mt-4 text-gray-600">載入中...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {departments.map(dept => (
            <div 
              key={dept.id} 
              className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all overflow-hidden border-t-4 ${
                dept.color && dept.color.startsWith('#') ? '' : `border-${dept.color}-500`
              }`}
              style={dept.color && dept.color.startsWith('#') ? { borderTopColor: dept.color } : {}}
            >
              {/* 卡片頭部 */}
              <div className="p-4 sm:p-5 lg:p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-lg flex items-center justify-center text-white text-lg sm:text-xl font-bold"
                      style={{ backgroundColor: dept.color }}
                    >
                      {dept.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{dept.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500">{dept.description || '暫無描述'}</p>
                    </div>
                  </div>
                </div>

                {/* 統計資訊 */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <div>
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">{dept.userCount}</p>
                        <p className="text-[11px] sm:text-xs text-gray-500">用戶數</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">{dept.fileCount}</p>
                        <p className="text-[11px] sm:text-xs text-gray-500">檔案</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 查詢系統網址 */}
                <div className="bg-blue-50 rounded-lg px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between mb-3">
                  <code className="text-[11px] sm:text-xs font-mono text-blue-700 truncate mr-2">
                    {window.location.origin}/query/{dept.slug}
                  </code>
                  <button
                    onClick={() => handleCopyUrl(dept.slug)}
                    className="flex-shrink-0 p-1 text-blue-600 hover:bg-blue-100 rounded cursor-pointer"
                    title="複製查詢網址"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>

                {/* 操作按鈕 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => enterDepartmentDashboard(dept)}
                    className="col-span-2 px-4 py-2 sm:px-5 sm:py-2.5 text-white rounded-lg shadow hover:shadow-lg transition-all cursor-pointer text-sm sm:text-base font-medium"
                    style={{ backgroundColor: 'var(--ncku-red)' }}
                  >
                    進入管理
                  </button>
                  <button
                    onClick={() => openAdminGroupModal(dept)}
                    className="col-span-2 px-4 py-2 sm:px-5 sm:py-2.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer text-sm sm:text-base font-medium"
                  >
                    管理組織
                  </button>
                  <button
                    onClick={() => openEditModal(dept)}
                    className="col-span-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer text-sm font-medium"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(dept)}
                    className="col-span-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors cursor-pointer text-sm font-medium"
                  >
                    刪除
                  </button>
                </div>
              </div>

              {/* 卡片底部 */}
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                <p className="text-xs text-gray-500">建立日期：{dept.createdAt}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增處室 Modal */}
      {addModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center ${addModal.animationClass}`}>
          <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-4 sm:p-6 ${addModal.contentAnimationClass}`}>
            <h3 className="text-lg sm:text-xl font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>
              新增處室
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  處室名稱 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="例如：人事室"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL 識別碼 (Slug) *
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                  placeholder="例如：hr, acc, it"
                />
                <p className="mt-1 text-xs text-gray-500">
                  用於網址：/{formData.slug || 'slug'}（只能使用小寫字母、數字和連字符）
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  處室描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows="3"
                  placeholder="選填"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  主題顏色
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {colorOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, color: option.value})}
                      style={{ backgroundColor: option.value }}
                      className={`h-10 rounded-lg hover:opacity-80 transition-opacity cursor-pointer ${
                        formData.color === option.value ? 'ring-4 ring-offset-2 ring-gray-400' : ''
                      }`}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  外部模型 API Key
                  <span className="ml-2 text-xs font-normal text-gray-500">（選填）</span>
                </label>
                <input
                  type="password"
                  value={formData.external_api_key}
                  onChange={(e) => setFormData({...formData, external_api_key: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                  placeholder="例：sk-... （OpenAI）、AIza... （Gemini）、sk-ant-... （Claude）"
                />
                <p className="mt-1 text-xs text-gray-500">
                  提供後，登入用戶在查詢未找到資料時，可選擇直接用此模型回覆
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  登入方式 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {LOGIN_METHOD_OPTIONS.map((option) => {
                    const methods = formData.login_methods || [];
                    const checked = methods.includes(option.key);
                    const isLastMethod = checked && methods.length === 1;
                    return (
                      <label key={option.key} className={`flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 ${isLastMethod ? 'opacity-60 cursor-not-allowed' : ''}`} title={isLastMethod ? '需保留至少一種登入方式' : undefined}>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{option.label}</p>
                          <p className="text-xs text-gray-500">{option.hint}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLoginMethod(option.key)}
                          disabled={isLastMethod}
                          className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                          title={isLastMethod ? '需保留至少一種登入方式' : undefined}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-500">系統會依勾選項目自動建立或移除對應預設身分組</p>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  addModal.handleClose();
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleAddDepartment}
                className="flex-1 px-4 py-2 text-white rounded-lg transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                確認新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯處室 Modal */}
      {editModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center ${editModal.animationClass}`}>
          <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-4 sm:p-6 ${editModal.contentAnimationClass}`}>
            <h3 className="text-lg sm:text-xl font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>
              編輯處室
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  處室名稱 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL 識別碼 (Slug)
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-mono text-sm"
                />
                <p className="mt-1 text-xs text-amber-600">
                  ⚠️ URL 識別碼不可修改，以避免已分享的連結失效
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  查詢網址：{window.location.origin}/query/{formData.slug}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  處室描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  主題顏色
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {colorOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, color: option.value})}
                      style={{ backgroundColor: option.value }}
                      className={`h-10 rounded-lg hover:opacity-80 transition-opacity cursor-pointer ${
                        formData.color === option.value ? 'ring-4 ring-offset-2 ring-gray-400' : ''
                      }`}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  外部模型 API Key
                  <span className="ml-2 text-xs font-normal text-gray-500">（選填）</span>
                </label>
                {editingDept?.has_external_api_key && (
                  <p className="mb-1 text-xs text-green-600">✓ 目前已設定 API Key，輸入新內容即可更新，留空則保持原設定</p>
                )}
                <input
                  type="password"
                  value={formData.external_api_key}
                  onChange={(e) => setFormData({...formData, external_api_key: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                  placeholder={editingDept?.has_external_api_key ? '留空不更改' : '例：sk-... （OpenAI）、AIza... （Gemini）、sk-ant-... （Claude）'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  登入方式 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {LOGIN_METHOD_OPTIONS.map((option) => {
                    const methods = formData.login_methods || [];
                    const checked = methods.includes(option.key);
                    const isLastMethod = checked && methods.length === 1;
                    return (
                      <label key={option.key} className={`flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 ${isLastMethod ? 'opacity-60 cursor-not-allowed' : ''}`} title={isLastMethod ? '需保留至少一種登入方式' : undefined}>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{option.label}</p>
                          <p className="text-xs text-gray-500">{option.hint}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLoginMethod(option.key)}
                          disabled={isLastMethod}
                          className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                          title={isLastMethod ? '需保留至少一種登入方式' : undefined}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-500">系統會依勾選項目自動建立或移除對應預設身分組</p>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  editModal.handleClose();
                  setEditingDept(null);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleEditDepartment}
                className="flex-1 px-4 py-2 text-white rounded-lg transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                確認更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm !== null}
        shouldRender={deleteConfirmModal.shouldRender}
        isClosing={deleteConfirmModal.isClosing}
        animationClass={deleteConfirmModal.animationClass}
        contentAnimationClass={deleteConfirmModal.contentAnimationClass}
        onClose={deleteConfirmModal.handleClose}
        onConfirm={() => {
          handleDeleteDepartment(showDeleteConfirm.id);
        }}
        title="確認刪除處室"
        message={`確定要刪除「${showDeleteConfirm?.name}」嗎？\n\n注意：此操作將會：\n• 刪除該處室下的所有使用者\n• 刪除該處室的所有檔案和資料\n• 此操作無法復原\n\n請確認您要繼續執行此操作。`}
        confirmText="確認刪除"
        cancelText="取消"
        type="danger"
      />

      {/* 管理組織 Modal */}
      {adminGroupModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center ${adminGroupModal.animationClass}`}>
          <div className={`relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-4 sm:p-6 max-h-[85vh] overflow-y-auto ${adminGroupModal.contentAnimationClass}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--ncku-red)' }}>
                {showAdminGroupModal?.name} — 管理組織
              </h3>
              <button onClick={adminGroupModal.handleClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {adminGroupLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-current border-r-transparent" style={{ color: 'var(--ncku-red)' }} />
              </div>
            ) : (
              <>
                {/* 組織列表 */}
                {adminGroups.length === 0 && !showAdminGroupForm ? (
                  <p className="text-gray-500 text-sm text-center py-6">尚無管理組織</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {adminGroups.map(group => (
                      <div key={group.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                          <div>
                            <span className="font-medium text-gray-900">{group.name}</span>
                            {group.description && <p className="text-xs text-gray-500">{group.description}</p>}
                            <p className="text-xs text-gray-400 mt-0.5">{group.user_count} 位管理員 · {group.file_count} 個檔案</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => {
                              setEditingAdminGroup(group);
                              setAdminGroupFormData({ name: group.name, description: group.description || '', color: group.color });
                              setShowAdminGroupForm(true);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                            title="編輯"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteAdminGroupConfirm(group)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                            title="刪除"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 新增/編輯表單 */}
                {showAdminGroupForm ? (
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">
                      {editingAdminGroup ? '編輯組織' : '新增組織'}
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">名稱 *</label>
                      <input
                        type="text"
                        value={adminGroupFormData.name}
                        onChange={(e) => setAdminGroupFormData({ ...adminGroupFormData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="例如：教務組"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                      <input
                        type="text"
                        value={adminGroupFormData.description}
                        onChange={(e) => setAdminGroupFormData({ ...adminGroupFormData, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="選填"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">顏色</label>
                      <div className="flex space-x-2">
                        {adminGroupColorOptions.map(c => (
                          <button
                            key={c}
                            onClick={() => setAdminGroupFormData({ ...adminGroupFormData, color: c })}
                            style={{ backgroundColor: c }}
                            className={`w-7 h-7 rounded-full cursor-pointer ${adminGroupFormData.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        onClick={resetAdminGroupForm}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveAdminGroup}
                        className="px-3 py-1.5 text-white rounded-lg text-sm cursor-pointer"
                        style={{ backgroundColor: 'var(--ncku-red)' }}
                      >
                        {editingAdminGroup ? '更新' : '新增'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAdminGroupForm(true)}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors cursor-pointer text-sm"
                  >
                    + 新增管理組織
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 刪除管理組織確認對話框 */}
      <ConfirmDialog
        isOpen={deleteAdminGroup_confirm !== null}
        shouldRender={deleteAdminGroupConfirmModal.shouldRender}
        isClosing={deleteAdminGroupConfirmModal.isClosing}
        animationClass={deleteAdminGroupConfirmModal.animationClass}
        contentAnimationClass={deleteAdminGroupConfirmModal.contentAnimationClass}
        onClose={deleteAdminGroupConfirmModal.handleClose}
        onConfirm={() => handleDeleteAdminGroup(deleteAdminGroup_confirm.id)}
        title="確認刪除管理組織"
        message={`確定要刪除「${deleteAdminGroup_confirm?.name}」嗎？${deleteAdminGroup_confirm?.file_count > 0 ? `\n\n⚠️ 此組織仍有 ${deleteAdminGroup_confirm.file_count} 個檔案，需先處理這些檔案才能刪除。` : ''}`}
        confirmText="確認刪除"
        cancelText="取消"
        type="danger"
      />

    </>
  );
}

export default DepartmentManagement;
