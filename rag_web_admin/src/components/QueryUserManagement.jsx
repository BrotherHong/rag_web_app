import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useModalAnimation } from '../hooks/useModalAnimation';
import {
  getQueryUserStats,
  getQueryUsers,
  createQueryUser,
  updateQueryUser,
  deleteQueryUser,
  suspendQueryUser,
  activateQueryUser
} from '../services/api/queryUsers';
import { getDepartments } from '../services/api';
import QueryUserPermissions from './QueryUserPermissions';

function QueryUserManagement() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Modal 狀態
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  
  // Modal 動畫
  const userModal = useModalAnimation(showUserModal, () => setShowUserModal(false));
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));
  
  // 表單狀態
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    organization: '',
    default_department_id: '',
    admin_notes: ''
  });

  useEffect(() => {
    loadStats();
    loadDepartments();
  }, []);

  useEffect(() => {
    loadUsers();
  }, [currentPage]);

  const loadStats = async () => {
    try {
      const data = await getQueryUserStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getQueryUsers({ page: currentPage, limit: 10 });
      setUsers(response.items || []);
      setTotalPages(response.pages || 1);
    } catch (error) {
      toast.error('載入用戶列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await getDepartments();
      if (response.success) {
        setDepartments(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      full_name: '',
      organization: '',
      default_department_id: '',
      admin_notes: ''
    });
    setShowUserModal(true);
  };

  const handleOpenEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // 不顯示密碼
      full_name: user.full_name || '',
      organization: user.organization || '',
      default_department_id: user.default_department_id || '',
      admin_notes: user.admin_notes || ''
    });
    setShowUserModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingUser) {
        // 編輯模式：只更新允許的欄位
        await updateQueryUser(editingUser.id, {
          default_department_id: formData.default_department_id ? parseInt(formData.default_department_id) : null,
          admin_notes: formData.admin_notes
        });
        toast.success('用戶資訊已更新');
      } else {
        // 新增模式
        const createData = {
          ...formData,
          default_department_id: formData.default_department_id ? parseInt(formData.default_department_id) : null
        };
        const newUser = await createQueryUser(createData);
        console.log('創建成功，用戶狀態:', newUser.status, '啟用狀態:', newUser.is_active);
        toast.success('查詢用戶創建成功');
      }
      
      setEditingUser(null);
      userModal.handleClose();
      // 稍微延遲以確保數據庫已提交
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadUsers();
      await loadStats();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error(error.message || '操作失敗');
    }
  };

  const handleDelete = async (userId) => {
    try {
      await deleteQueryUser(userId);
      toast.success('用戶已刪除');
      deleteModal.handleClose();
      await loadUsers();
      await loadStats();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.message || '刪除失敗');
    }
  };

  const handleToggleActive = async (user) => {
    try {
      if (user.is_active) {
        await suspendQueryUser(user.id);
        toast.success('用戶已停用');
      } else {
        await activateQueryUser(user.id);
        toast.success('用戶已啟用');
      }
      await loadUsers();
      await loadStats();
    } catch (error) {
      console.error('Toggle active error:', error);
      toast.error(error.message || '操作失敗');
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { text: '待審批', class: 'bg-yellow-100 text-yellow-800' },
      'approved': { text: '已批准', class: 'bg-green-100 text-green-800' },
      'rejected': { text: '已拒絕', class: 'bg-red-100 text-red-800' },
      'suspended': { text: '已停用', class: 'bg-gray-100 text-gray-800' }
    };
    
    const badge = statusMap[status] || statusMap['pending'];
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badge.class}`}>
        {badge.text}
      </span>
    );
  };

  const getActiveBadge = (isActive) => {
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
        {isActive ? '啟用中' : '已停用'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 統計卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">總用戶數</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">已批准</div>
            <div className="text-2xl font-bold text-green-600 mt-2">{stats.approved}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">待審批</div>
            <div className="text-2xl font-bold text-yellow-600 mt-2">{stats.pending}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">已啟用</div>
            <div className="text-2xl font-bold text-blue-600 mt-2">{stats.active}</div>
          </div>
        </div>
      )}

      {/* 用戶列表 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">查詢用戶列表</h2>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            ＋ 新增查詢用戶
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">載入中...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-500">尚無查詢用戶</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      用戶資訊
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      組織/處室
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      審批狀態
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      啟用狀態
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                        <div className="text-xs text-gray-400">@{user.username}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{user.organization || '-'}</div>
                        <div className="text-xs text-gray-500">
                          {user.default_department?.name || '未設定處室'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(user.status)}
                      </td>
                      <td className="px-6 py-4">
                        {getActiveBadge(user.is_active)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="text-blue-600 hover:text-blue-800 cursor-pointer text-sm font-medium"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => setSelectedUserForPermissions(user)}
                            className="text-purple-600 hover:text-purple-800 cursor-pointer text-sm font-medium"
                          >
                            權限
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`${user.is_active ? 'text-orange-600 hover:text-orange-800' : 'text-green-600 hover:text-green-800'} cursor-pointer text-sm font-medium`}
                          >
                            {user.is_active ? '停用' : '啟用'}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(user)}
                            className="text-red-600 hover:text-red-800 cursor-pointer text-sm font-medium"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分頁 */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex justify-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  上一頁
                </button>
                <span className="px-3 py-1">
                  第 {currentPage} / {totalPages} 頁
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  下一頁
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 新增/編輯用戶 Modal */}
      {userModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${userModal.animationClass}`}>
          <div className={`bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto ${userModal.contentAnimationClass}`}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? '編輯查詢用戶' : '新增查詢用戶'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {!editingUser && (
                <>
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                      使用者名稱 *
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      電子郵件 *
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      密碼 *
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                      全名 *
                    </label>
                    <input
                      id="full_name"
                      name="full_name"
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="organization" className="block text-sm font-medium text-gray-700 mb-1">
                      所屬組織
                    </label>
                    <input
                      id="organization"
                      name="organization"
                      type="text"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {editingUser && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="text-sm"><span className="font-medium">使用者名稱：</span>{editingUser.username}</div>
                  <div className="text-sm"><span className="font-medium">電子郵件：</span>{editingUser.email}</div>
                  <div className="text-sm"><span className="font-medium">全名：</span>{editingUser.full_name}</div>
                </div>
              )}

              <div>
                <label htmlFor="default_department_id" className="block text-sm font-medium text-gray-700 mb-1">
                  預設處室
                </label>
                <select
                  id="default_department_id"
                  name="default_department_id"
                  value={formData.default_department_id}
                  onChange={(e) => setFormData({ ...formData, default_department_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                >
                  <option value="">請選擇處室</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="admin_notes" className="block text-sm font-medium text-gray-700 mb-1">
                  管理員備註
                </label>
                <textarea
                  id="admin_notes"
                  name="admin_notes"
                  value={formData.admin_notes}
                  onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    userModal.handleClose();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  {editingUser ? '更新' : '創建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {deleteModal.shouldRender && showDeleteConfirm && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${deleteModal.animationClass}`}>
          <div className={`bg-white rounded-lg shadow-xl max-w-md w-full ${deleteModal.contentAnimationClass}`}>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">確認刪除</h3>
              <p className="text-gray-600 mb-6">
                確定要刪除用戶「{showDeleteConfirm.full_name}」嗎？此操作無法復原。
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={deleteModal.handleClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                >
                  刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 權限管理 Modal */}
      {selectedUserForPermissions && (
        <QueryUserPermissions
          userId={selectedUserForPermissions.id}
          userName={selectedUserForPermissions.full_name}
          onClose={() => setSelectedUserForPermissions(null)}
        />
      )}
    </div>
  );
}

export default QueryUserManagement;
