/**
 * API Client Wrapper
 * 統一處理所有 API 請求，集中管理 401 過期邏輯
 */

import { PathUtils } from '../config/config.js';

/**
 * 清除使用者憑證並重新導向到登入頁
 */
const handleTokenExpired = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('isAuthenticated');
  localStorage.removeItem('superAdminUser');
  // 使用統一配置的路徑工具，自動適配不同環境
  window.location.href = PathUtils.getAppPath('/');
};

/**
 * 統一的 fetch wrapper，自動處理 401 未授權情況
 * @param {string} url - 請求的 URL
 * @param {object} options - fetch 選項（與原生 fetch 相同）
 * @returns {Promise<Response>} fetch 回應物件
 */
export const apiFetch = async (url, options = {}) => {
  try {
    const finalOptions = { ...options };
    // 預設禁用瀏覽器快取，除非呼叫端有明確指定
    if (!('cache' in finalOptions)) {
      finalOptions.cache = 'no-store';
    }
    if (!finalOptions.headers) finalOptions.headers = {};
    finalOptions.headers = {
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      ...finalOptions.headers,
    };

    const response = await fetch(url, finalOptions);
    
    // 檢查 401 未授權（JWT 過期或無效）
    if (response.status === 401) {
      console.warn('登入憑證已過期，正在清除憑證並重新導向...');
      handleTokenExpired();
      // 拋出錯誤以便調用者捕捉
      throw new Error('登入已過期，請重新登入');
    }
    
    return response;
  } catch (error) {
    // 如果是 401 導致的錯誤，已經在上面處理過
    if (error.message === '登入已過期，請重新登入') {
      throw error;
    }
    // 其他網路錯誤正常拋出
    throw error;
  }
};
