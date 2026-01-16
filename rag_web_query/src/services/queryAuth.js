/**
 * 查詢用戶認證服務
 * 完全獨立於後台管理員系統
 */

// API 基礎 URL
// 開發環境：使用完整 URL
// 生產環境：使用相對路徑（通過 Nginx 代理）
const getApiBaseUrl = () => {
  const viteApiUrl = import.meta.env.VITE_API_BASE_URL;
  
  // 如果是開發環境且沒有配置，使用默認值
  if (import.meta.env.DEV && !viteApiUrl) {
    return 'http://localhost:8000/api';
  }
  
  // 直接使用配置的 URL（不再添加 /v1，因為後端 API_V1_PREFIX 已經是 /api）
  return viteApiUrl || '/api';
};

const API_BASE_URL = getApiBaseUrl();

// Token 存儲鍵（與管理員系統分開）
const QUERY_TOKEN_KEY = 'query_token';
const QUERY_USER_KEY = 'query_user';

/**
 * 儲存查詢用戶 token
 */
export const saveQueryToken = (token) => {
  localStorage.setItem(QUERY_TOKEN_KEY, token);
};

/**
 * 獲取查詢用戶 token
 */
export const getQueryToken = () => {
  return localStorage.getItem(QUERY_TOKEN_KEY);
};

/**
 * 移除查詢用戶 token
 */
export const removeQueryToken = () => {
  localStorage.removeItem(QUERY_TOKEN_KEY);
  localStorage.removeItem(QUERY_USER_KEY);
};

/**
 * 儲存查詢用戶資訊
 */
export const saveQueryUser = (user) => {
  localStorage.setItem(QUERY_USER_KEY, JSON.stringify(user));
};

/**
 * 獲取查詢用戶資訊
 */
export const getQueryUser = () => {
  const userStr = localStorage.getItem(QUERY_USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
};

/**
 * 檢查是否已登入
 */
export const isQueryUserLoggedIn = () => {
  return !!getQueryToken();
};

/**
 * 查詢用戶登入
 */
export const loginQueryUser = async (username, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/query-auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    // 處理 HTTP 錯誤
    if (!response.ok) {
      let errorMessage = '登入失敗';
      
      try {
        const error = await response.json();
        
        // 根據不同的 HTTP 狀態碼提供更具體的錯誤訊息
        switch (response.status) {
          case 401:
            errorMessage = '帳號或密碼錯誤，請重新輸入';
            break;
          case 403:
            // 帳號狀態問題
            errorMessage = error.detail || '帳號無法使用，請聯繫管理員';
            break;
          case 404:
            errorMessage = '登入服務不可用，請稍後再試';
            break;
          case 500:
            errorMessage = '伺服器錯誤，請稍後再試';
            break;
          default:
            errorMessage = error.detail || `登入失敗 (錯誤碼: ${response.status})`;
        }
      } catch (parseError) {
        // JSON 解析失敗，使用通用錯誤訊息
        errorMessage = `登入失敗 (錯誤碼: ${response.status})`;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // 驗證返回數據
    if (!data.access_token || !data.user) {
      throw new Error('登入回應格式錯誤，請聯繫管理員');
    }
    
    // 儲存 token 和用戶資訊
    saveQueryToken(data.access_token);
    saveQueryUser(data.user);
    
    return data;
  } catch (error) {
    // 處理網絡錯誤
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('無法連接到伺服器，請檢查網絡連接或稍後再試');
    }
    
    // 重新拋出其他錯誤
    throw error;
  }
};

/**
 * 查詢用戶登出
 */
export const logoutQueryUser = () => {
  removeQueryToken();
  // 可以在這裡添加導航邏輯
};

/**
 * 獲取當前查詢用戶資訊
 */
export const getCurrentQueryUser = async () => {
  const token = getQueryToken();
  if (!token) {
    throw new Error('未登入');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/query-auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token 無效，清除本地存儲
        removeQueryToken();
        throw new Error('登入已過期，請重新登入');
      }
      
      let errorMessage = '獲取用戶資訊失敗';
      try {
        const error = await response.json();
        errorMessage = error.detail || errorMessage;
      } catch (parseError) {
        // JSON 解析失敗，使用默認訊息
      }
      
      throw new Error(errorMessage);
    }

    const user = await response.json();
    saveQueryUser(user);
    return user;
  } catch (error) {
    // 處理網絡錯誤
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('無法連接到伺服器，請檢查網絡連接');
    }
    
    throw error;
  }
};
