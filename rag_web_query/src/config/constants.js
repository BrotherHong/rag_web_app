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
  
  // 請求超時設定（毫秒）- 60秒以平衡等待時間與使用者體驗
  TIMEOUT: 60000,
}

// 應用程式常數
export const APP_CONSTANTS = {
  // 應用名稱
  APP_NAME: '人事室AI助手',
  APP_SUBTITLE: '智能化人事服務，讓管理更高效',
  
  // 成功大學資訊
  UNIVERSITY: {
    NAME: '國立成功大學',
    LOGO_PATH: `${import.meta.env.BASE_URL}images/supai.png`,
  },
}

// 錯誤訊息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '網路連線發生錯誤，請檢查您的網路連線。',
  SERVER_ERROR: '伺服器發生錯誤，請稍後再試。',
  TIMEOUT_ERROR: '請求逾時，請稍後再試。',
  INVALID_REQUEST: '請求格式錯誤，請重新嘗試。',
  UNKNOWN_ERROR: '發生未知錯誤，請稍後再試。',
}
