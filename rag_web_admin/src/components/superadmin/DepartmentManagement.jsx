/**
 * Department Management Component
 * 處室管理組件 - 負責處室的新增、編輯、刪除和顯示
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDepartmentStats,
  addDepartment,
  updateDepartment,
  deleteDepartment
} from '../../services/api';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';
import DepartmentStatsModal from './DepartmentStatsModal';

function DepartmentManagement({ departments, onRefresh, isLoading }) {
  const navigate = useNavigate();
  const toast = useToast();
  
  // 處室相關的 state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(null);
  const [editingDept, setEditingDept] = useState(null);
  const [statsData, setStatsData] = useState(null);

  // 對話框動畫 Hooks
  const addModal = useModalAnimation(showAddModal, () => setShowAddModal(false));
  const editModal = useModalAnimation(showEditModal, () => setShowEditModal(false));
  const deleteConfirmModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));

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

  // 打開編輯 Modal
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

  // 重置表單
  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      color: '#3B82F6' // 預設藍色
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

    try {
      const response = await addDepartment(formData);
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

    try {
      const response = await updateDepartment(editingDept.id, formData);
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

  return (
    <>
      {/* 標題和新增按鈕 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--ncku-red)' }}>
            處室管理
          </h2>
          <p className="text-gray-600 mt-2">管理各處室的 AI 客服後台系統</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 text-white rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer font-medium flex items-center space-x-2"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map(dept => (
            <div 
              key={dept.id} 
              className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all overflow-hidden border-t-4 ${
                dept.color && dept.color.startsWith('#') ? '' : `border-${dept.color}-500`
              }`}
              style={dept.color && dept.color.startsWith('#') ? { borderTopColor: dept.color } : {}}
            >
              {/* 卡片頭部 */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold"
                      style={{ backgroundColor: dept.color }}
                    >
                      {dept.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{dept.name}</h3>
                      <p className="text-sm text-gray-500">{dept.description || '暫無描述'}</p>
                    </div>
                  </div>
                </div>

                {/* 統計資訊 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{dept.userCount}</p>
                        <p className="text-xs text-gray-500">使用者</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{dept.fileCount}</p>
                        <p className="text-xs text-gray-500">檔案</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 操作按鈕 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => enterDepartmentDashboard(dept)}
                    className="col-span-2 px-4 py-2 text-white rounded-lg shadow hover:shadow-lg transition-all cursor-pointer text-sm font-medium"
                    style={{ backgroundColor: 'var(--ncku-red)' }}
                  >
                    進入管理
                  </button>
                  <button
                    onClick={() => viewStats(dept)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer text-sm font-medium"
                  >
                    查看詳情
                  </button>
                  <button
                    onClick={() => openEditModal(dept)}
                    className="px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer text-sm font-medium"
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
          <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 ${addModal.contentAnimationClass}`}>
            <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>
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
                <div className="grid grid-cols-4 gap-2">
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
          <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 ${editModal.contentAnimationClass}`}>
            <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>
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
                <div className="grid grid-cols-4 gap-2">
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

      {/* 處室統計 Modal */}
      {showStatsModal && statsData && (
        <DepartmentStatsModal
          department={showStatsModal}
          statsData={statsData}
          onClose={() => {
            setShowStatsModal(null);
            setStatsData(null);
          }}
        />
      )}
    </>
  );
}

export default DepartmentManagement;
