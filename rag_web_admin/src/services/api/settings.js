/**
 * System Settings API Module
 * 負責處理系統設定、備份還原相關功能 (僅供 super_admin 使用)
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
 * 取得系統設定
 * @returns {Promise} 系統設定
 */
export const getSettings = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/settings/`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [{key, value, ...}], total, page, pages }
      // 將設定項目轉換為物件，key 作為屬性名
      const settings = {};
      if (data.items) {
        data.items.forEach(item => {
          settings[item.key] = item.value;
        });
      }
      
      return {
        success: true,
        data: settings
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取系統設定失敗'
      };
    }
  } catch (error) {
    console.error('Get settings error:', error);
    return {
      success: false,
      message: '獲取系統設定失敗，請檢查網路連線'
    };
  }
};

/**
 * 更新系統設定
 * @param {Object} settings - 系統設定
 * @returns {Promise} 更新結果
 */
export const updateSettings = async (settings) => {
  try {
    // 權限檢查：需要 super_admin 權限
    const permission = checkPermission(ROLES.SUPER_ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    // 將設定物件轉換回後端期待的格式
    const backendSettings = {
      rag: settings.rag || {},
      app: settings.app || {},
      feature: settings.feature || {},
      backup: settings.backup || {},
      security: settings.security || {}
    };
    
    const response = await apiFetch(`${API_BASE_URL}/settings/batch`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings: backendSettings })
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '設定已儲存'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '儲存設定失敗'
      };
    }
  } catch (error) {
    console.error('Update settings error:', error);
    return {
      success: false,
      message: '儲存設定失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得備份歷史
 * @returns {Promise} 備份歷史
 */
export const getBackupHistory = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/backups/history`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [{id, date, size, status}] }
      return {
        success: true,
        data: data.items || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取備份歷史失敗'
      };
    }
  } catch (error) {
    console.error('Get backup history error:', error);
    return {
      success: false,
      message: '獲取備份歷史失敗，請檢查網路連線'
    };
  }
};

/**
 * 建立手動備份
 * @returns {Promise} 備份結果
 */
export const createBackup = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/backups/create`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '備份建立成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '建立備份失敗'
      };
    }
  } catch (error) {
    console.error('Create backup error:', error);
    return {
      success: false,
      message: '建立備份失敗，請檢查網路連線'
    };
  }
};

/**
 * 還原備份
 * @param {number} backupId - 備份 ID
 * @returns {Promise} 還原結果
 */
export const restoreBackup = async (backupId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/backups/${backupId}/restore`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '備份還原成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '還原備份失敗'
      };
    }
  } catch (error) {
    console.error('Restore backup error:', error);
    return {
      success: false,
      message: '還原備份失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得系統資訊
 * @returns {Promise} 系統資訊
 */
export const getSystemInfo = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/system/info`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { version, uptime, cpuUsage, memoryUsage, databaseSize, cacheSize, apiRequests, errorRate, storage }
      return {
        success: true,
        data: data
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取系統資訊失敗'
      };
    }
  } catch (error) {
    console.error('Get system info error:', error);
    return {
      success: false,
      message: '獲取系統資訊失敗，請檢查網路連線'
    };
  }
};
