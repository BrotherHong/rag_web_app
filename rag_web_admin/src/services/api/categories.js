/**
 * Categories API Module
 * 負責處理分類管理相關功能
 */

import { ROLES, checkPermission } from '../utils/permissions.js';
import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL（從環境變數讀取）
const API_BASE_URL = PathUtils.getApiUrl('');

/**
 * 獲取 Authorization Header（加上代理支援）
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
 * 取得所有分類（僅分類名稱）
 * @returns {Promise} 分類名稱列表
 */
export const getCategories = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/categories/`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [{id, name, color, fileCount, ...}] }
      const categoryNames = data.items.map(cat => cat.name);
      
      // 將「其他」排在最後
      const sorted = categoryNames.sort((a, b) => {
        if (a === '其他') return 1;
        if (b === '其他') return -1;
        return 0;
      });
      
      return {
        success: true,
        data: sorted
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取分類失敗'
      };
    }
  } catch (error) {
    console.error('Get categories error:', error);
    return {
      success: false,
      message: '獲取分類失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得所有分類（含詳細資訊）
 * @returns {Promise} 分類詳細列表
 */
export const getCategoriesWithDetails = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/categories/`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // 後端可能回傳陣列或 { items: [...] } 格式
      // 根據實際回傳格式處理
      let categories = Array.isArray(data) ? data : (data.items || []);
      
      // 將「其他」排在最後
      const sorted = categories.sort((a, b) => {
        if (a.name === '其他') return 1;
        if (b.name === '其他') return -1;
        return 0;
      });
      
      return {
        success: true,
        data: sorted
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取分類詳細資訊失敗'
      };
    }
  } catch (error) {
    console.error('Get categories with details error:', error);
    return {
      success: false,
      message: '獲取分類詳細資訊失敗，請檢查網路連線'
    };
  }
};

/**
 * 新增分類
 * @param {string} name - 分類名稱
 * @param {string} color - 分類顏色
 * @returns {Promise} 新增結果
 */
export const addCategory = async (name, color = '#6B7280') => {
  try {
    // 權限檢查：需要 admin 權限
    const permission = checkPermission(ROLES.ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const response = await apiFetch(`${API_BASE_URL}/categories/`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, color })
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          color: data.color,
          count: data.fileCount || 0,
          createdAt: data.createdAt
        },
        message: '分類新增成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '分類新增失敗'
      };
    }
  } catch (error) {
    console.error('Add category error:', error);
    return {
      success: false,
      message: '新增分類失敗，請檢查網路連線'
    };
  }
};

/**
 * 刪除分類
 * @param {number} categoryId - 分類 ID
 * @returns {Promise} 刪除結果
 */
export const deleteCategory = async (categoryId) => {
  try {
    // 權限檢查：需要 admin 權限
    const permission = checkPermission(ROLES.ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const response = await apiFetch(`${API_BASE_URL}/categories/${categoryId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '分類刪除成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '刪除分類失敗'
      };
    }
  } catch (error) {
    console.error('Delete category error:', error);
    return {
      success: false,
      message: '刪除分類失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得分類統計資訊
 * @returns {Promise} 統計資料
 */
export const getCategoryStats = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/categories/stats`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { stats: [{id, name, color, fileCount, totalSize, percentage}] }
      return {
        success: true,
        data: data.stats || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取分類統計失敗'
      };
    }
  } catch (error) {
    console.error('Get category stats error:', error);
    return {
      success: false,
      message: '獲取分類統計失敗，請檢查網路連線'
    };
  }
};
