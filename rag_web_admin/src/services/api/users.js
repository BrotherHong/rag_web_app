/**
 * Users Management API Module
 * 負責處理使用者管理相關功能 (僅供 super_admin 使用)
 */

import { ROLES, checkPermission } from '../utils/permissions.js';
import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL（實際應用中應該從環境變數讀取）
const API_BASE_URL = PathUtils.getApiUrl('');

// 取得授權標頭
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
 * 取得所有使用者
 * @param {number} departmentId - 可選的處室 ID，用於篩選特定處室的使用者
 * @returns {Promise} 使用者列表
 */
export const getUsers = async (departmentId = null) => {
  try {
    let url = `${API_BASE_URL}/users/`;
    if (departmentId) {
      url += `?department_id=${departmentId}`;
    }
    
    const response = await apiFetch(url, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [{id, full_name, username, email, role, department_id, is_active}] }
      // 映射為前端期待的格式
      const mappedUsers = (data.items || []).map(user => ({
        id: user.id,
        name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role,
        departmentId: user.department_id,
        status: user.is_active ? 'active' : 'inactive'
      }));
      
      return {
        success: true,
        data: mappedUsers
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取使用者列表失敗'
      };
    }
  } catch (error) {
    console.error('Get users error:', error);
    return {
      success: false,
      message: '獲取使用者列表失敗，請檢查網路連線'
    };
  }
};

/**
 * 新增使用者
 * @param {Object} userData - 使用者資料
 * @returns {Promise} 新增結果
 */
export const addUser = async (userData) => {
  try {
    // 權限檢查：需要 super_admin 權限
    const permission = checkPermission(ROLES.SUPER_ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    // 映射為後端期待的格式
    const requestData = {
      username: userData.username,
      email: userData.email,
      full_name: userData.name,
      password: userData.password,
      department_id: parseInt(userData.departmentId)
    };
    
    const response = await apiFetch(`${API_BASE_URL}/users/`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: {
          id: data.id,
          name: data.full_name,
          username: data.username,
          email: data.email,
          role: data.role,
          departmentId: data.department_id,
          status: data.is_active ? 'active' : 'inactive'
        },
        message: '使用者新增成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '新增使用者失敗'
      };
    }
  } catch (error) {
    console.error('Add user error:', error);
    return {
      success: false,
      message: '新增使用者失敗，請檢查網路連線'
    };
  }
};

/**
 * 更新使用者
 * @param {number} userId - 使用者 ID
 * @param {Object} userData - 使用者資料
 * @returns {Promise} 更新結果
 */
export const updateUser = async (userId, userData) => {
  try {
    // 權限檢查：需要 super_admin 權限
    const permission = checkPermission(ROLES.SUPER_ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    // 映射為後端期待的格式
    const requestData = {
      email: userData.email,
      full_name: userData.name,
      department_id: parseInt(userData.departmentId)
    };
    
    // 只有填寫密碼時才更新密碼
    if (userData.password && userData.password.trim()) {
      requestData.password = userData.password;
    }
    
    const response = await apiFetch(`${API_BASE_URL}/users/${userId}/`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '使用者更新成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '更新使用者失敗'
      };
    }
  } catch (error) {
    console.error('Update user error:', error);
    return {
      success: false,
      message: '更新使用者失敗，請檢查網路連線'
    };
  }
};

/**
 * 根據處室ID取得使用者列表
 * @param {number} departmentId - 處室 ID
 * @returns {Promise} 該處室的使用者列表
 */
export const getUsersByDepartment = async (departmentId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/users/?department_id=${departmentId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [{id, full_name, username, email, role, department_id, is_active}] }
      // 映射為前端期待的格式
      const mappedUsers = (data.items || []).map(user => ({
        id: user.id,
        name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role,
        departmentId: user.department_id,
        status: user.is_active ? 'active' : 'inactive'
      }));
      
      return {
        success: true,
        data: mappedUsers
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取使用者列表失敗'
      };
    }
  } catch (error) {
    console.error('Get users by department error:', error);
    return {
      success: false,
      message: '獲取使用者列表失敗，請檢查網路連線'
    };
  }
};

/**
 * 刪除使用者
 * @param {number} userId - 使用者 ID
 * @returns {Promise} 刪除結果
 */
export const deleteUser = async (userId) => {
  try {
    // 權限檢查：需要 super_admin 權限
    const permission = checkPermission(ROLES.SUPER_ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const url = `${API_BASE_URL}/users/${userId}`;
    const headers = getAuthHeader();
    console.log('刪除使用者請求詳情:', { url, method: 'DELETE', headers });
    
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: headers
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '使用者刪除成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '刪除使用者失敗'
      };
    }
  } catch (error) {
    console.error('Delete user error:', error);
    return {
      success: false,
      message: '刪除使用者失敗，請檢查網路連線'
    };
  }
};
