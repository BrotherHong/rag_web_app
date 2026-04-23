/**
 * User Management Component
 * 使用者管理組件 - 負責處室管理員的新增、編輯、刪除和顯示
 */

import { useState, useEffect } from 'react';
import {
  addUser,
  updateUser,
  deleteUser,
  getAdminGroups
} from '../../services/api';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';

function UserManagement({ users, departments, onRefresh, isLoading }) {
  const toast = useToast();
  
  // 使用者相關的 state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  // 對話框動畫 Hooks
  const addUserModal = useModalAnimation(showAddUserModal, () => setShowAddUserModal(false));
  const editUserModal = useModalAnimation(showEditUserModal, () => setShowEditUserModal(false));
  const deleteUserConfirmModal = useModalAnimation(showDeleteUserConfirm !== null, () => setShowDeleteUserConfirm(null));

  // 使用者表單資料
  const [userFormData, setUserFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    departmentId: '',
    adminGroupId: ''
  });

  // 管理組織列表（依選擇的處室動態載入）
  const [deptAdminGroups, setDeptAdminGroups] = useState([]);

  // 所有管理組織 id → name 對照（用於表格顯示）
  const [allAdminGroupMap, setAllAdminGroupMap] = useState({});

  // 載入所有處室的管理組織（供表格 lookup）
  useEffect(() => {
    const loadAll = async () => {
      const map = {};
      for (const dept of departments) {
        const res = await getAdminGroups(dept.id);
        if (res.success) {
          for (const g of res.data) {
            map[g.id] = g.name;
          }
        }
      }
      setAllAdminGroupMap(map);
    };
    if (departments.length > 0) loadAll();
  }, [departments]);

  // 處室變更時載入該處室的管理組織
  useEffect(() => {
    const deptId = userFormData.departmentId;
    if (deptId) {
      getAdminGroups(parseInt(deptId)).then(res => {
        if (res.success) {
          setDeptAdminGroups(res.data);
        } else {
          setDeptAdminGroups([]);
        }
      });
    } else {
      setDeptAdminGroups([]);
    }
  }, [userFormData.departmentId]);

  // 根據處室 ID 獲取處室名稱
  const getDepartmentNameById = (deptId) => {
    const dept = departments.find(d => d.id === deptId);
    return dept ? dept.name : '未知處室';
  };

  // 重置使用者表單
  const resetUserForm = () => {
    setUserFormData({
      name: '',
      username: '',
      email: '',
      password: '',
      departmentId: '',
      adminGroupId: ''
    });
    setDeptAdminGroups([]);
  };

  // 處理新增使用者
  const handleAddUser = async () => {
    if (!userFormData.name.trim() || !userFormData.username.trim() || 
        !userFormData.email.trim() || !userFormData.password.trim() || !userFormData.departmentId) {
      toast.warning('請填寫所有必填欄位');
      return;
    }

    if (userFormData.password.trim().length < 6) {
      toast.warning('密碼至少需要 6 個字元');
      return;
    }

    try {
      const response = await addUser(userFormData);
      if (response.success) {
        await onRefresh();
        addUserModal.handleClose();
        resetUserForm();
        toast.success('使用者新增成功');
      } else {
        toast.error('新增失敗：' + response.message);
      }
    } catch (error) {
      console.error('新增使用者錯誤:', error);
      toast.error('新增使用者失敗');
    }
  };

  // 處理編輯使用者
  const handleEditUser = async () => {
    if (!userFormData.name.trim() || !userFormData.email.trim() || !userFormData.departmentId) {
      toast.warning('請填寫所有必填欄位');
      return;
    }

    if (userFormData.password.trim() && userFormData.password.trim().length < 6) {
      toast.warning('新密碼至少需要 6 個字元');
      return;
    }

    try {
      const updateData = {
        name: userFormData.name,
        email: userFormData.email,
        departmentId: userFormData.departmentId,
        adminGroupId: userFormData.adminGroupId || null
      };
      
      // 只有填寫密碼時才更新密碼
      if (userFormData.password.trim()) {
        updateData.password = userFormData.password;
      }

      const response = await updateUser(editingUser.id, updateData);
      if (response.success) {
        await onRefresh();
        editUserModal.handleClose();
        setEditingUser(null);
        resetUserForm();
        toast.success('使用者更新成功');
      } else {
        toast.error('更新失敗：' + response.message);
      }
    } catch (error) {
      console.error('更新使用者錯誤:', error);
      toast.error('更新使用者失敗');
    }
  };

  // 處理刪除使用者
  const handleDeleteUser = async (userId) => {
    try {
      const response = await deleteUser(userId);
      if (response.success) {
        await onRefresh();
        // deleteUserConfirmModal.handleClose(); // 移除：讓 ConfirmDialog 自己處理關閉
        toast.success('使用者刪除成功');
      } else {
        toast.error('刪除失敗：' + response.message);
      }
    } catch (error) {
      console.error('刪除使用者錯誤:', error);
      toast.error('刪除使用者失敗');
    }
  };

  // 開啟編輯使用者對話框
  const openEditUserModal = (user) => {
    setEditingUser(user);
    setUserFormData({
      name: user.name,
      username: user.username,
      email: user.email,
      password: '',
      departmentId: user.departmentId,
      adminGroupId: user.adminGroupId || ''
    });
    setShowEditUserModal(true);
  };

  return (
    <>
      {/* 標題和新增按鈕 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--ncku-red)' }}>
            管理員帳號
          </h2>
          <p className="text-gray-600 mt-2">管理所有管理員帳號</p>
        </div>
        <button
          onClick={() => setShowAddUserModal(true)}
          className="px-6 py-3 text-white rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer font-medium flex items-center space-x-2"
          style={{ backgroundColor: 'var(--ncku-red)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>新增管理員</span>
        </button>
      </div>

      {/* 使用者列表 */}
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
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">姓名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">帳號</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">所屬處室</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden lg:table-cell">管理組織</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">狀態</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{user.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap hidden md:table-cell">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {user.role === 'SUPER_ADMIN'
                        ? <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">系統管理員</span>
                        : getDepartmentNameById(user.departmentId)
                      }
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap hidden lg:table-cell">
                      {user.adminGroupId ? (allAdminGroupMap[user.adminGroupId] || '—') : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        {user.status === 'active' ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="text-gray-400 text-xs">—</span>
                      ) : (
                        <>
                          <button 
                            onClick={() => openEditUserModal(user)}
                            className="text-blue-600 hover:text-blue-800 mr-2 sm:mr-3 cursor-pointer"
                          >
                            編輯
                          </button>
                          <button 
                            onClick={() => setShowDeleteUserConfirm(user)}
                            className="text-red-600 hover:text-red-800 cursor-pointer"
                          >
                            刪除
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 小螢幕提示 */}
      <div className="md:hidden text-sm text-gray-500 text-center mt-4">
        <p>💡 向左滑動查看更多資訊</p>
      </div>

      {/* 新增使用者對話框 */}
      {addUserModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${addUserModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-md ${addUserModal.contentAnimationClass}`}>
            <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--ncku-red)' }}>新增使用者</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入姓名"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">帳號 *</label>
                <input
                  type="text"
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入帳號"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入 Email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密碼 *（至少 6 個字元）</label>
                <input
                  type="password"
                  minLength={6}
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入密碼"
                />
                <p className="text-xs text-gray-500 mt-1">密碼至少 6 個字元</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所屬處室 *</label>
                <select
                  value={userFormData.departmentId}
                  onChange={(e) => setUserFormData({ ...userFormData, departmentId: e.target.value, adminGroupId: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none cursor-pointer"
                >
                  <option value="">請選擇處室</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所屬管理組織</label>
                <select
                  value={userFormData.adminGroupId}
                  onChange={(e) => setUserFormData({ ...userFormData, adminGroupId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none cursor-pointer"
                >
                  <option value="">不指定</option>
                  {deptAdminGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">選填，指定後該管理員只能操作同組織的檔案</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  addUserModal.handleClose();
                  resetUserForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleAddUser}
                disabled={!userFormData.name.trim() || !userFormData.username.trim() || 
                          !userFormData.email.trim() || !userFormData.password.trim() || !userFormData.departmentId}
                className="px-4 py-2 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯使用者對話框 */}
      {editUserModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${editUserModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-md ${editUserModal.contentAnimationClass}`}>
            <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--ncku-red)' }}>編輯使用者</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入姓名"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
                <input
                  type="text"
                  value={userFormData.username}
                  readOnly
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                  placeholder="請輸入帳號"
                />
                <p className="text-xs text-gray-500 mt-1">帳號無法修改</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="請輸入 Email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密碼（至少 6 個字元）</label>
                <input
                  type="password"
                  minLength={6}
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  placeholder="留空則不修改密碼"
                />
                <p className="text-xs text-gray-500 mt-1">留空則保持原密碼不變；若要修改，至少 6 個字元</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所屬處室 *</label>
                <select
                  value={userFormData.departmentId}
                  onChange={(e) => setUserFormData({ ...userFormData, departmentId: e.target.value, adminGroupId: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none cursor-pointer"
                >
                  <option value="">請選擇處室</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所屬管理組織</label>
                <select
                  value={userFormData.adminGroupId}
                  onChange={(e) => setUserFormData({ ...userFormData, adminGroupId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none cursor-pointer"
                >
                  <option value="">不指定</option>
                  {deptAdminGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">選填，指定後該管理員只能操作同組織的檔案</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  editUserModal.handleClose();
                  setEditingUser(null);
                  resetUserForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleEditUser}
                disabled={!userFormData.name.trim() || !userFormData.email.trim() || !userFormData.departmentId}
                className="px-4 py-2 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除使用者確認對話框 */}
      <ConfirmDialog
        isOpen={showDeleteUserConfirm !== null}
        shouldRender={deleteUserConfirmModal.shouldRender}
        isClosing={deleteUserConfirmModal.isClosing}
        animationClass={deleteUserConfirmModal.animationClass}
        contentAnimationClass={deleteUserConfirmModal.contentAnimationClass}
        onClose={deleteUserConfirmModal.handleClose}
        onConfirm={() => {
          handleDeleteUser(showDeleteUserConfirm.id);
        }}
        title="確認刪除使用者"
        message={`確定要刪除使用者「${showDeleteUserConfirm?.name}」嗎？此操作無法復原。`}
        confirmText="確認刪除"
        cancelText="取消"
        type="danger"
      />
    </>
  );
}

export default UserManagement;
