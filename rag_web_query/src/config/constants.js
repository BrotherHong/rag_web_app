// API 配置
export const API_CONFIG = {
  // 後端 API 基礎 URL
  // Docker 部署時使用相對路徑，開發環境可使用完整 URL
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  
  // API 端點（常用端點）
  ENDPOINTS: {
    // 常見問題相關（統一端點）
    FAQ_LIST: '/faq/list',
  },
  
  // 請求超時設定（毫秒）
  TIMEOUT: 30000,
}

// 應用程式常數
export const APP_CONSTANTS = {
  // 應用名稱
  APP_NAME: '人事室AI助手',
  APP_SUBTITLE: '智能化人事服務，讓管理更高效',
  
  // 成功大學資訊
  UNIVERSITY: {
    NAME: '國立成功大學',
    NAME_EN: 'National Cheng Kung University',
    // 使用相對於 BASE_URL 的路徑，自動適配部署環境
    LOGO_PATH: `${import.meta.env.BASE_URL}images/ncku_logo.png`,
  },
  
  // 聯絡資訊
  CONTACT: {
    PHONE: '(06) 275-7575',
    EXTENSION: '50200',
    EMAIL: 'hr@ncku.edu.tw',
  },
  
  // UI 設定
  UI: {
    // 打字效果延遲（毫秒）
    TYPING_DELAY: 1500,
    // 訊息最大長度
    MAX_MESSAGE_LENGTH: 2000,
  },
}

// 路徑工具函數
export const PathUtils = {
  /**
   * 取得靜態資源路徑
   * @param {string} path - 相對於 public 的路徑
   * @returns {string} 完整路徑
   */
  getAssetPath(path) {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${basePath}${cleanPath}`;
  },
  
  /**
   * 取得 API URL
   * @param {string} endpoint - API 端點
   * @returns {string} 完整 API URL
   */
  getApiUrl(endpoint = '') {
    const baseUrl = API_CONFIG.BASE_URL.replace(/\/$/, '');
    if (!endpoint) return baseUrl; // 如果沒有 endpoint，直接返回 baseUrl
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${cleanEndpoint}`;
  }
}

// 錯誤訊息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '網路連線發生錯誤，請檢查您的網路連線。',
  SERVER_ERROR: '伺服器發生錯誤，請稍後再試。',
  TIMEOUT_ERROR: '請求逾時，請稍後再試。',
  INVALID_REQUEST: '請求格式錯誤，請重新嘗試。',
  UNKNOWN_ERROR: '發生未知錯誤，請稍後再試。',
}

// 成功訊息
export const SUCCESS_MESSAGES = {
  MESSAGE_SENT: '訊息已送出',
  CHAT_CREATED: '已建立新對話',
  DATA_LOADED: '資料載入成功',
}
