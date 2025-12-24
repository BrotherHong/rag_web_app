/**
 * 應用程式統一配置
 * 所有路徑相關的配置都在這裡集中管理
 */

// 從環境變數讀取配置，提供預設值
export const APP_CONFIG = {
  // 應用基礎路徑（由 Vite 從 vite.config.js 的 base 選項自動注入）
  BASE_PATH: import.meta.env.BASE_URL,
  
  // API 基礎 URL
  // Docker 部署時使用相對路徑 '/api'
  // 開發環境可以使用完整 URL 'http://localhost:8000/api'
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  
  // 應用程式名稱
  APP_NAME: 'RAG 知識庫管理系統',
};

/**
 * 路徑工具函數
 * 提供統一的路徑處理邏輯
 */
export const PathUtils = {
  /**
   * 取得完整的應用路徑
   * @param {string} path - 相對路徑（例如 '/', '/login', '/dashboard'）
   * @returns {string} 完整路徑
   * @example
   * PathUtils.getAppPath('/') // '/admin/' 或 '/' (取決於環境變數)
   * PathUtils.getAppPath('/dashboard') // '/admin/dashboard' 或 '/dashboard'
   */
  getAppPath(path = '/') {
    const basePath = APP_CONFIG.BASE_PATH.replace(/\/$/, ''); // 移除尾部斜線
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${basePath}${cleanPath}`;
  },
  
  /**
   * 取得完整的 API URL
   * @param {string} endpoint - API 端點（例如 '/users', '/auth/login'）
   * @returns {string} 完整 API URL
   * @example
   * PathUtils.getApiUrl('/auth/login') // '/api/auth/login' 或 'http://localhost:8000/api/auth/login'
   */
  getApiUrl(endpoint = '') {
    const baseUrl = APP_CONFIG.API_BASE_URL.replace(/\/$/, ''); // 移除尾部斜線
    if (!endpoint) return baseUrl; // 如果沒有 endpoint，直接返回 baseUrl
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${cleanEndpoint}`;
  },
};
