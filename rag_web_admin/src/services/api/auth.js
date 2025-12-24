/**
 * Authentication API Module
 * 負責處理使用者認證相關功能
 */

import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL（從環境變數讀取）
const API_BASE_URL = PathUtils.getApiUrl('');

/**
 * 登入 API
 * @param {string} username - 使用者帳號
 * @param {string} password - 使用者密碼
 * @returns {Promise} 登入結果
 */
export const login = async (username, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // 後端返回格式: { token, user: { id, username, email, name, role, isSuperAdmin, department: {...} } }
      return {
        success: true,
        data: {
          user: {
            id: data.user.id,
            username: data.user.username,
            name: data.user.name || data.user.fullName,
            email: data.user.email,
            role: data.user.role,
            departmentId: data.user.department?.id || null,
            departmentName: data.user.department?.name || null,
            isSuperAdmin: data.user.isSuperAdmin || false
          },
          token: data.token
        },
        message: '登入成功'
      };
    } else {
      return {
        success: false,
        message: data.detail || data.message || '帳號或密碼錯誤'
      };
    }
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: '登入失敗，請檢查網路連線或稍後再試'
    };
  }
};

/**
 * 登出 API
 * @returns {Promise} 登出結果
 */
export const logout = async () => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // 無論後端回應如何，都清除本地儲存
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    if (response.ok) {
      return {
        success: true,
        message: '登出成功'
      };
    } else {
      // 即使後端失敗，前端也算登出成功
      return {
        success: true,
        message: '登出成功'
      };
    }
  } catch (error) {
    console.error('Logout error:', error);
    // 清除本地儲存
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    return {
      success: true,
      message: '登出成功'
    };
  }
};

/**
 * 驗證 Token 有效性
 * @param {string} token - JWT Token
 * @returns {Promise} 驗證結果
 */
export const verifyToken = async (token) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: data.user,
        message: 'Token 有效'
      };
    } else {
      return {
        success: false,
        message: 'Token 無效或已過期'
      };
    }
  } catch (error) {
    console.error('Token verification error:', error);
    return {
      success: false,
      message: '驗證失敗'
    };
  }
};
