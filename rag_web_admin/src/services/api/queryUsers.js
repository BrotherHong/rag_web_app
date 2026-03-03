/**
 * 查詢用戶管理 API 模組
 * 用於後台管理員管理查詢用戶（Query Users）
 */

import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL
const API_BASE_URL = PathUtils.getApiUrl('');

/**
 * 獲取 Authorization Header
 */
const getAuthHeader = () => {
  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
  
  // 如果是代理模式，添加 X-Proxy-Department-Id header
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
 * 獲取查詢用戶統計資訊
 */
export const getQueryUserStats = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/stats`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '獲取統計資訊失敗');
    }
  } catch (error) {
    console.error('Get query user stats error:', error);
    throw error;
  }
};

/**
 * 獲取查詢用戶列表
 * @param {Object} params - 查詢參數
 * @param {number} params.page - 頁碼
 * @param {number} params.limit - 每頁數量
 * @param {string} params.status - 狀態篩選 (PENDING, APPROVED, REJECTED, SUSPENDED)
 * @param {boolean} params.is_active - 啟用狀態篩選
 * @param {string} params.search - 搜尋關鍵字
 */
export const getQueryUsers = async (params = {}) => {
  try {
    const queryString = new URLSearchParams({
      page: params.page || 1,
      limit: params.limit || 10,
      ...(params.status && { status: params.status }),
      ...(params.is_active !== null && params.is_active !== undefined && { is_active: params.is_active }),
      ...(params.search && { search: params.search })
    }).toString();
    
    const response = await apiFetch(`${API_BASE_URL}/query-users/list?${queryString}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '獲取用戶列表失敗');
    }
  } catch (error) {
    console.error('Get query users error:', error);
    throw error;
  }
};

/**
 * 獲取單一查詢用戶詳細資訊
 * @param {number} userId - 用戶 ID
 */
export const getQueryUserDetail = async (userId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/${userId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '獲取用戶詳情失敗');
    }
  } catch (error) {
    console.error('Get query user detail error:', error);
    throw error;
  }
};

/**
 * 管理員直接創建查詢用戶（無需審批）
 * @param {Object} userData - 用戶資料
 * @param {string} userData.username - 使用者名稱
 * @param {string} userData.email - 電子郵件
 * @param {string} userData.password - 密碼
 * @param {string} userData.full_name - 全名
 * @param {string} userData.organization - 所屬組織
 * @param {number} userData.default_department_id - 預設處室 ID
 * @param {number} userData.max_queries_per_day - 每日查詢限額
 * @param {string} userData.admin_notes - 管理員備註
 */
export const createQueryUser = async (userData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/create`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '創建用戶失敗');
    }
  } catch (error) {
    console.error('Create query user error:', error);
    throw error;
  }
};

/**
 * 更新查詢用戶資訊
 * @param {number} userId - 用戶 ID
 * @param {Object} userData - 更新資料
 */
export const updateQueryUser = async (userId, userData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/${userId}`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '更新用戶失敗');
    }
  } catch (error) {
    console.error('Update query user error:', error);
    throw error;
  }
};

/**
 * 停用查詢用戶
 * @param {number} userId - 用戶 ID
 */
export const suspendQueryUser = async (userId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/${userId}/suspend`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '停用用戶失敗');
    }
  } catch (error) {
    console.error('Suspend query user error:', error);
    throw error;
  }
};

/**
 * 啟用查詢用戶
 * @param {number} userId - 用戶 ID
 */
export const activateQueryUser = async (userId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/${userId}/activate`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '啟用用戶失敗');
    }
  } catch (error) {
    console.error('Activate query user error:', error);
    throw error;
  }
};

/**
 * 刪除查詢用戶
 * @param {number} userId - 用戶 ID
 */
export const deleteQueryUser = async (userId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/query-users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || '刪除用戶失敗');
    }
  } catch (error) {
    console.error('Delete query user error:', error);
    throw error;
  }
};
