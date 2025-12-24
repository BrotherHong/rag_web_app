/**
 * FAQs API Module
 * 負責處理常見問題管理相關功能
 */

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
 * 獲取處室的 FAQ 列表
 * @returns {Promise} FAQ 列表
 */
export const getFaqs = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/faqs/`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: data.items || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取 FAQ 列表失敗'
      };
    }
  } catch (error) {
    console.error('獲取 FAQ 列表錯誤:', error);
    return {
      success: false,
      message: '網路錯誤，請稍後再試'
    };
  }
};

/**
 * 新增 FAQ
 * @param {Object} faqData - FAQ 資料
 * @returns {Promise} 新增結果
 */
export const addFaq = async (faqData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/faqs/`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(faqData)
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: data
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '新增 FAQ 失敗'
      };
    }
  } catch (error) {
    console.error('新增 FAQ 錯誤:', error);
    return {
      success: false,
      message: '網路錯誤，請稍後再試'
    };
  }
};

/**
 * 更新 FAQ
 * @param {number} faqId - FAQ ID
 * @param {Object} faqData - 更新的 FAQ 資料
 * @returns {Promise} 更新結果
 */
export const updateFaq = async (faqId, faqData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/faqs/${faqId}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(faqData)
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: data
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '更新 FAQ 失敗'
      };
    }
  } catch (error) {
    console.error('更新 FAQ 錯誤:', error);
    return {
      success: false,
      message: '網路錯誤，請稍後再試'
    };
  }
};

/**
 * 刪除 FAQ
 * @param {number} faqId - FAQ ID
 * @returns {Promise} 刪除結果
 */
export const deleteFaq = async (faqId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/faqs/${faqId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      return {
        success: true,
        message: 'FAQ 刪除成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '刪除 FAQ 失敗'
      };
    }
  } catch (error) {
    console.error('刪除 FAQ 錯誤:', error);
    return {
      success: false,
      message: '網路錯誤，請稍後再試'
    };
  }
};

/**
 * 切換 FAQ 啟用狀態
 * @param {number} faqId - FAQ ID
 * @param {boolean} isActive - 是否啟用
 * @returns {Promise} 更新結果
 */
export const toggleFaqStatus = async (faqId, isActive) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/faqs/${faqId}/toggle`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_active: isActive })
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: data
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '切換狀態失敗'
      };
    }
  } catch (error) {
    console.error('切換 FAQ 狀態錯誤:', error);
    return {
      success: false,
      message: '網路錯誤，請稍後再試'
    };
  }
};

/**
 * 更新 FAQ 排序
 * @param {Array} faqs - FAQ ID 陣列（按新順序）
 * @returns {Promise} 更新結果
 */
export const updateFaqOrder = async (faqs) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/faqs/reorder`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ faq_ids: faqs })
    });
    
    if (response.ok) {
      return {
        success: true,
        message: '排序更新成功'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '更新排序失敗'
      };
    }
  } catch (error) {
    console.error('更新 FAQ 排序錯誤:', error);
    return {
      success: false,
      message: '網路錯誤，請稍後再試'
    };
  }
};
