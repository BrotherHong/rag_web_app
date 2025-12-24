/**
 * Batch Upload API Module
 * 負責處理批次上傳相關功能
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
 * 檢查重複檔案並找出相關檔案
 * @param {Array} fileList - 待檢查的檔案列表 [{ name, size, type }]
 * @returns {Promise} 檢查結果，包含重複和相關檔案
 */
export const checkDuplicates = async (fileList) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/check-duplicates`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filenames: fileList.map(f => f.name) })
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { results: [{fileName, isDuplicate, duplicateFile, relatedFiles, suggestReplace}] }
      return {
        success: true,
        data: data.results || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '檢查重複檔案失敗'
      };
    }
  } catch (error) {
    console.error('Check duplicates error:', error);
    return {
      success: false,
      message: '檢查重複檔案失敗，請檢查網路連線'
    };
  }
};

/**
 * 批次上傳檔案到知識庫
 * @param {Object} uploadData - { files: File[], categories: {}, removeFileIds: [] }
 * @returns {Promise} 上傳任務 ID
 */
export const batchUpload = async (uploadData) => {
  try {
    // 權限檢查：需要 admin 權限
    const permission = checkPermission(ROLES.ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const formData = new FormData();
    uploadData.files.forEach(file => formData.append('files', file));
    formData.append('categories', JSON.stringify(uploadData.categories || {}));
    formData.append('removeFileIds', JSON.stringify(uploadData.removeFileIds || []));
    formData.append('startProcessing', 'true');
    
    const response = await apiFetch(`${API_BASE_URL}/upload/batch`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { taskId, message }
      return {
        success: true,
        data: {
          taskId: data.taskId,
          message: data.message || '上傳任務已建立，開始處理檔案'
        }
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '建立上傳任務失敗'
      };
    }
  } catch (error) {
    console.error('Batch upload error:', error);
    return {
      success: false,
      message: '建立上傳任務失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得上傳任務進度
 * @param {string} taskId - 任務 ID
 * @returns {Promise} 任務進度資訊
 */
export const getUploadProgress = async (taskId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/progress/${taskId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const result = await response.json();
      // 後端返回: { success: true, data: { taskId, status, totalFiles, ... } }
      return {
        success: true,
        data: result.data  // 提取 data 欄位
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取上傳進度失敗'
      };
    }
  } catch (error) {
    console.error('Get upload progress error:', error);
    return {
      success: false,
      message: '獲取上傳進度失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得使用者的所有上傳任務
 * @returns {Promise} 任務列表
 */
export const getUserUploadTasks = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/tasks`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [...] }
      return {
        success: true,
        data: data.items || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取上傳任務列表失敗'
      };
    }
  } catch (error) {
    console.error('Get user upload tasks error:', error);
    return {
      success: false,
      message: '獲取上傳任務列表失敗，請檢查網路連線'
    };
  }
};

/**
 * 刪除已完成的上傳任務記錄
 * @param {string} taskId - 任務 ID
 * @returns {Promise} 刪除結果
 */
export const deleteUploadTask = async (taskId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '任務記錄已刪除'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '刪除任務失敗'
      };
    }
  } catch (error) {
    console.error('Delete upload task error:', error);
    return {
      success: false,
      message: '刪除任務失敗，請檢查網路連線'
    };
  }
};
