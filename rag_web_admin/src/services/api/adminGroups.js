/**
 * Admin Groups API Module
 * 管理組織相關 API（SuperAdmin 專用）
 */

import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

const API_BASE_URL = PathUtils.getApiUrl('');

const getAuthHeader = () => {
  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
  const userStr = localStorage.getItem('user');
  if (userStr) {
    const user = JSON.parse(userStr);
    if (user.isSuperAdminProxy && user.departmentId) {
      headers['X-Proxy-Department-Id'] = user.departmentId.toString();
    }
  }
  return headers;
};

/**
 * 取得處室的管理組織列表
 * @param {number} departmentId - 處室 ID
 * @returns {Promise} 管理組織列表
 */
export const getAdminGroups = async (departmentId) => {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}/admin-groups/?department_id=${departmentId}`,
      { method: 'GET', headers: getAuthHeader() }
    );
    if (response.ok) {
      const data = await response.json();
      return { success: true, data: data.items || [] };
    }
    const error = await response.json();
    return { success: false, message: error.detail || '取得管理組織失敗' };
  } catch (error) {
    console.error('Get admin groups error:', error);
    return { success: false, message: '取得管理組織失敗' };
  }
};

/**
 * 建立管理組織
 */
export const createAdminGroup = async (groupData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/admin-groups/`, {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    const error = await response.json();
    return { success: false, message: error.detail || '建立管理組織失敗' };
  } catch (error) {
    console.error('Create admin group error:', error);
    return { success: false, message: '建立管理組織失敗' };
  }
};

/**
 * 更新管理組織
 */
export const updateAdminGroup = async (groupId, groupData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/admin-groups/${groupId}`, {
      method: 'PUT',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    const error = await response.json();
    return { success: false, message: error.detail || '更新管理組織失敗' };
  } catch (error) {
    console.error('Update admin group error:', error);
    return { success: false, message: '更新管理組織失敗' };
  }
};

/**
 * 刪除管理組織
 */
export const deleteAdminGroup = async (groupId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/admin-groups/${groupId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (response.ok || response.status === 204) {
      return { success: true };
    }
    const error = await response.json();
    return { success: false, message: error.detail || '刪除管理組織失敗' };
  } catch (error) {
    console.error('Delete admin group error:', error);
    return { success: false, message: '刪除管理組織失敗' };
  }
};
