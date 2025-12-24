/**
 * 實用工具函數
 */

/**
 * 格式化時間戳記
 * @param {Date|string} timestamp - 時間戳記
 * @param {string} format - 格式類型 ('time' | 'date' | 'datetime')
 * @returns {string} 格式化後的時間字串
 */
export const formatTimestamp = (timestamp, format = 'time') => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  
  switch (format) {
    case 'time':
      return date.toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    case 'date':
      return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    case 'datetime':
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    default:
      return date.toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
  }
}

/**
 * 生成唯一的會話 ID
 * @returns {string} 會話 ID
 */
export const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 生成唯一的訊息 ID
 * @returns {string} 訊息 ID
 */
export const generateMessageId = () => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 驗證訊息長度
 * @param {string} message - 訊息內容
 * @param {number} maxLength - 最大長度
 * @returns {boolean} 是否有效
 */
export const validateMessageLength = (message, maxLength = 2000) => {
  return message && message.trim().length > 0 && message.length <= maxLength
}

/**
 * 截斷長文字
 * @param {string} text - 原始文字
 * @param {number} maxLength - 最大長度
 * @param {string} suffix - 後綴（預設為 '...'）
 * @returns {string} 截斷後的文字
 */
export const truncateText = (text, maxLength = 100, suffix = '...') => {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength - suffix.length) + suffix
}

/**
 * 延遲執行
 * @param {number} ms - 延遲毫秒數
 * @returns {Promise} Promise
 */
export const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 深度複製物件
 * @param {Object} obj - 要複製的物件
 * @returns {Object} 複製後的物件
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * 檢查是否為空值
 * @param {any} value - 要檢查的值
 * @returns {boolean} 是否為空
 */
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * 安全的 JSON 解析
 * @param {string} jsonString - JSON 字串
 * @param {any} defaultValue - 預設值
 * @returns {any} 解析結果或預設值
 */
export const safeJsonParse = (jsonString, defaultValue = null) => {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    console.error('JSON parse error:', error)
    return defaultValue
  }
}

/**
 * 防抖函數
 * @param {Function} func - 要執行的函數
 * @param {number} wait - 等待時間（毫秒）
 * @returns {Function} 防抖後的函數
 */
export const debounce = (func, wait = 300) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * 節流函數
 * @param {Function} func - 要執行的函數
 * @param {number} limit - 限制時間（毫秒）
 * @returns {Function} 節流後的函數
 */
export const throttle = (func, limit = 300) => {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

/**
 * 複製文字到剪貼簿
 * @param {string} text - 要複製的文字
 * @returns {Promise<boolean>} 是否成功
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('Failed to copy text:', error)
    return false
  }
}

/**
 * 下載文字檔案
 * @param {string} content - 檔案內容
 * @param {string} filename - 檔案名稱
 * @param {string} type - MIME 類型
 */
export const downloadTextFile = (content, filename = 'download.txt', type = 'text/plain') => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 格式化檔案大小
 * @param {number} bytes - 位元組數
 * @param {number} decimals - 小數位數
 * @returns {string} 格式化後的大小
 */
export const formatFileSize = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * 滾動到元素
 * @param {HTMLElement|string} element - 元素或選擇器
 * @param {Object} options - 滾動選項
 */
export const scrollToElement = (element, options = {}) => {
  const target = typeof element === 'string' 
    ? document.querySelector(element) 
    : element
    
  if (target) {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      ...options
    })
  }
}

/**
 * 獲取 URL 參數
 * @param {string} param - 參數名稱
 * @returns {string|null} 參數值
 */
export const getUrlParameter = (param) => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get(param)
}

/**
 * 檢查是否為行動裝置
 * @returns {boolean} 是否為行動裝置
 */
export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * 儲存到 localStorage
 * @param {string} key - 鍵名
 * @param {any} value - 值
 * @returns {boolean} 是否成功
 */
export const saveToLocalStorage = (key, value) => {
  try {
    const serializedValue = JSON.stringify(value)
    localStorage.setItem(key, serializedValue)
    return true
  } catch (error) {
    console.error('Error saving to localStorage:', error)
    return false
  }
}

/**
 * 從 localStorage 讀取
 * @param {string} key - 鍵名
 * @param {any} defaultValue - 預設值
 * @returns {any} 讀取的值或預設值
 */
export const loadFromLocalStorage = (key, defaultValue = null) => {
  try {
    const serializedValue = localStorage.getItem(key)
    return serializedValue ? JSON.parse(serializedValue) : defaultValue
  } catch (error) {
    console.error('Error loading from localStorage:', error)
    return defaultValue
  }
}

/**
 * 從 localStorage 刪除
 * @param {string} key - 鍵名
 * @returns {boolean} 是否成功
 */
export const removeFromLocalStorage = (key) => {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    console.error('Error removing from localStorage:', error)
    return false
  }
}
