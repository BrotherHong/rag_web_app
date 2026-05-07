/**
 * Activities & Statistics API Module
 * 負責處理活動記錄和統計資料相關功能
 */

import { ROLES, checkPermission } from '../utils/permissions.js';
import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL（實際應用中應該從環境變數讀取）
const API_BASE_URL = PathUtils.getApiUrl('');

// 取得授權標頭（加上代理支援）
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
 * 取得系統統計資料
 * @returns {Promise} 統計資料
 */
export const getStatistics = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/statistics`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { totalFiles, filesByCategory, monthlyQueries, systemStatus, storageUsed, storageTotal }
      return {
        success: true,
        data: data
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取統計資料失敗'
      };
    }
  } catch (error) {
    console.error('Get statistics error:', error);
    return {
      success: false,
      message: '獲取統計資料失敗，請檢查網路連線'
    };
  }
};

/**
 * 手動執行「無結果問題 TopN」彙整
 * @param {Object} params - 執行參數
 * @returns {Promise}
 */
export const runNoResultInsights = async (params = {}) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/statistics/no-results-insights/run`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data
      };
    }

    const error = await response.json();
    return {
      success: false,
      message: error.detail || '執行無結果問題彙整失敗'
    };
  } catch (error) {
    console.error('Run no-result insights error:', error);
    return {
      success: false,
      message: '執行無結果問題彙整失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得最近熱門查詢
 * @param {Object} params - 查詢參數 { days, limit }
 * @returns {Promise}
 */
export const getPopularQueries = async (params = {}) => {
  try {
    const queryString = new URLSearchParams({
      days: (params.days || 30).toString(),
      limit: (params.limit || 10).toString()
    });

    const response = await apiFetch(`${API_BASE_URL}/statistics/popular-queries?${queryString}`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data
      };
    }

    const error = await response.json();
    return {
      success: false,
      message: error.detail || '取得熱門查詢失敗'
    };
  } catch (error) {
    console.error('Get popular queries error:', error);
    return {
      success: false,
      message: '取得熱門查詢失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得歷史查詢與回覆
 * @param {Object} params - 查詢參數 { page, limit, search, days }
 * @returns {Promise}
 */
export const getQueryHistory = async (params = {}) => {
  try {
    const queryString = new URLSearchParams({
      page: (params.page || 1).toString(),
      limit: (params.limit || 20).toString()
    });

    if (params.search) {
      queryString.append('search', params.search);
    }
    if (params.days) {
      queryString.append('days', params.days.toString());
    }

    const response = await apiFetch(`${API_BASE_URL}/statistics/query-history?${queryString}`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data
      };
    }

    const error = await response.json();
    return {
      success: false,
      message: error.detail || '取得歷史查詢失敗'
    };
  } catch (error) {
    console.error('Get query history error:', error);
    return {
      success: false,
      message: '取得歷史查詢失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得最近活動記錄
 * @param {number} limit - 限制數量
 * @returns {Promise} 活動記錄
 */
export const getRecentActivities = async (limit = 10) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/activities?limit=${limit}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [{id, activity_type, description, username, file_name, created_at, department_id, department_name, ...}] }
      // 映射為前端期待的格式
      const mappedActivities = (data.items || []).map(activity => ({
        id: activity.id,
        type: activity.activity_type,
        description: activity.description,
        fileName: activity.file_name,
        user: activity.username || activity.user_full_name,
        timestamp: activity.created_at,
        userName: activity.user_full_name,
        departmentId: activity.department_id,
        departmentName: activity.department_name,
        categoryName: null  // 如果需要可以從 description 解析
      }));
      
      return {
        success: true,
        data: mappedActivities
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取活動記錄失敗'
      };
    }
  } catch (error) {
    console.error('Get recent activities error:', error);
    return {
      success: false,
      message: '獲取活動記錄失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得所有處室的活動記錄 (僅供系統管理員使用)
 * @param {number} departmentId - 處室 ID，傳入 null 則取得所有處室
 * @param {number} limit - 限制數量
 * @returns {Promise} 活動記錄
 */
export const getAllActivities = async (departmentId = null, limit = 50) => {
  try {
    // 權限檢查：需要 super_admin 權限
    const permission = checkPermission(ROLES.SUPER_ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const params = new URLSearchParams({ limit: limit.toString() });
    if (departmentId !== null) {
      params.append('departmentId', departmentId.toString());
    }
    
    const response = await apiFetch(`${API_BASE_URL}/activities/all?${params}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [...], total }
      // 映射為前端期待的格式
      const mappedActivities = (data.items || []).map(activity => ({
        id: activity.id,
        type: activity.activity_type.toLowerCase(), // 轉為小寫
        description: activity.description,
        fileName: activity.file_name,
        user: activity.username || activity.user_full_name,
        timestamp: activity.created_at,
        userName: activity.user_full_name,
        departmentId: activity.department_id,
        departmentName: activity.department_name,
        categoryName: null
      }));
      
      return {
        success: true,
        data: mappedActivities
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取活動記錄失敗'
      };
    }
  } catch (error) {
    console.error('Get all activities error:', error);
    return {
      success: false,
      message: '獲取活動記錄失敗，請檢查網路連線'
    };
  }
};
