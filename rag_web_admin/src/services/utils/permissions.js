/**
 * 權限管理模組
 */

// 權限級別定義
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',  // 系統管理員：可以管理所有處室
  ADMIN: 'ADMIN'               // 處室管理員：可以管理自己處室的所有內容
};

// 權限檢查工具函數
export const checkPermission = (requiredRole) => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      return { hasPermission: false, message: '未登入' };
    }
    
    const user = JSON.parse(userStr);
    const userRole = user.role;
    
    // 權限層級：SUPER_ADMIN > ADMIN
    const roleHierarchy = {
      SUPER_ADMIN: 2,
      ADMIN: 1
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    if (userLevel >= requiredLevel) {
      return { hasPermission: true };
    }
    
    return { 
      hasPermission: false, 
      message: '權限不足，此操作需要更高權限'
    };
  } catch (error) {
    return { hasPermission: false, message: '權限驗證失敗' };
  }
};
