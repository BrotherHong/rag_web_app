/**
 * Files API Module
 * 負責處理知識庫檔案相關功能
 */

import { ROLES, checkPermission } from '../utils/permissions.js';
import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL（從環境變數讀取）
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
 * 取得所有檔案
 * @param {Object} params - 查詢參數 { search, category, page, limit, sort, order }
 * @returns {Promise} 檔案列表
 */
export const getFiles = async (params = {}) => {
  try {
    const queryString = new URLSearchParams({
      page: params.page || 1,
      limit: params.limit || 20,  // 預設每頁 20 筆
      ...(params.search && { search: params.search }),
      ...(params.category && params.category !== 'all' && { category_id: params.category }),
      ...(params.department_id && { department_id: params.department_id }),
      ...(params.sort && { sort: params.sort }),
      ...(params.order && { order: params.order })
    }).toString();
    
    const response = await apiFetch(`${API_BASE_URL}/files/?${queryString}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [...], total, page, pages }
      // 將後端欄位映射到前端期待的格式
      const mappedFiles = data.items.map(file => ({
        id: file.id,
        name: file.original_filename,
        category: file.category?.name || '其他',
        size: `${(file.file_size / (1024 * 1024)).toFixed(2)} MB`,
        uploadDate: new Date(file.created_at).toLocaleDateString('zh-TW'),
        status: file.status,
        uploader: file.uploader?.full_name || file.uploader?.username || '未知',
        isVectorized: file.is_vectorized,
        vectorCount: file.vector_count || 0,
        downloadCount: file.download_count || 0,
        is_public: file.is_public || false
      }));
      
      return {
        success: true,
        data: {
          files: mappedFiles,
          total: data.total,
          page: data.page,
          pages: data.pages
        }
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取檔案列表失敗'
      };
    }
  } catch (error) {
    console.error('Get files error:', error);
    return {
      success: false,
      message: '獲取檔案列表失敗，請檢查網路連線'
    };
  }
};

/**
 * 上傳檔案
 * @param {FormData} formData - 包含檔案的表單資料
 * @returns {Promise} 上傳結果
 */
export const uploadFile = async (formData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData  // FormData 會自動設定 Content-Type
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { id, filename, originalFilename, fileSize, status, message }
      return {
        success: true,
        data: {
          id: data.id,
          name: data.originalFilename,
          filename: data.filename,
          size: `${(data.fileSize / (1024 * 1024)).toFixed(2)} MB`,
          status: data.status,
          uploadDate: new Date().toISOString().split('T')[0]
        },
        message: data.message || '檔案上傳成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '檔案上傳失敗'
      };
    }
  } catch (error) {
    console.error('Upload file error:', error);
    return {
      success: false,
      message: '檔案上傳失敗，請檢查網路連線'
    };
  }
};

/**
 * 刪除檔案
 * @param {number} fileId - 檔案 ID
 * @returns {Promise} 刪除結果
 */
export const deleteFile = async (fileId) => {
  try {
    // 權限檢查：需要 admin 權限
    const permission = checkPermission(ROLES.ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const response = await apiFetch(`${API_BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: data.success !== undefined ? data.success : true,
        message: data.message || '檔案刪除成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '檔案刪除失敗'
      };
    }
  } catch (error) {
    console.error('Delete file error:', error);
    return {
      success: false,
      message: '檔案刪除失敗，請檢查網路連線'
    };
  }
};

/**
 * 下載檔案
 * @param {number} fileId - 檔案 ID
 * @param {string} fileName - 檔案名稱（可選，如未提供則使用預設名稱）
 * @returns {Promise} 下載連結或直接觸發下載
 */
export const downloadFile = async (fileId, fileName = null) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/files/${fileId}/download`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const downloadFileName = fileName || `file_${fileId}`;
      
      // 取得檔案 blob
      const blob = await response.blob();
      
      // 建立下載連結並觸發下載
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      return {
        success: true,
        message: '檔案下載成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '檔案下載失敗'
      };
    }
  } catch (error) {
    console.error('Download file error:', error);
    return {
      success: false,
      message: '檔案下載失敗，請檢查網路連線'
    };
  }
};

/**
 * 更新檔案資訊
 * @param {number} fileId - 檔案 ID
 * @param {Object} data - 更新資料 { category_id, description, tags, is_public }
 * @returns {Promise} 更新結果
 */
export const updateFile = async (fileId, data) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/files/${fileId}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      return {
        success: true,
        message: '檔案資訊已更新'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '更新檔案資訊失敗'
      };
    }
  } catch (error) {
    console.error('Update file error:', error);
    return {
      success: false,
      message: '更新檔案資訊失敗，請檢查網路連線'
    };
  }
};
