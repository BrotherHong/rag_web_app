/**
 * System Info API Module
 * 負責處理系統資訊相關功能
 */

import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL
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
 * 取得系統資訊
 * @param {string} timeRange - 時間範圍 (today/week/month/all)
 * @returns {Promise} 系統資訊
 */
export const getSystemInfo = async (timeRange = 'all') => {
  try {
    const url = `${API_BASE_URL}/system/info?time_range=${timeRange}`;
    const response = await apiFetch(url, {
      method: 'GET',
      headers: getAuthHeader()
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
