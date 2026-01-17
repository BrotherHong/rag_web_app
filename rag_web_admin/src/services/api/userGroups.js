/**
 * 用戶身分組管理 API
 */

import { apiFetch } from '../apiClient';
import { APP_CONFIG } from '../../config/config';

const API_BASE_URL = APP_CONFIG.API_BASE_URL;

/**
 * 獲取 Authorization Header
 */
const getAuthHeader = () => {
  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
  
  // 如果是代理模式，添加 X-Proxy-Department-Id header
  const userStr = localStorage.getItem('user');
  if (userStr) {
    const user = JSON.parse(userStr);
    console.log('[getAuthHeader] User info:', user);
    if (user.isSuperAdminProxy && user.departmentId) {
      console.log('[getAuthHeader] Adding X-Proxy-Department-Id:', user.departmentId);
      headers['X-Proxy-Department-Id'] = user.departmentId.toString();
    } else {
      console.log('[getAuthHeader] Not in proxy mode or no departmentId');
    }
  }
  
  console.log('[getAuthHeader] Final headers:', headers);
  return headers;
};

/**
 * 取得身分組列表
 */
export const getUserGroups = async (includeCounts = true) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/?include_counts=${includeCounts}`, {
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
        message: error.detail || '獲取身分組列表失敗'
      };
    }
  } catch (error) {
    console.error('Get user groups error:', error);
    return {
      success: false,
      message: '獲取身分組列表失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得身分組詳情（包含成員列表）
 */
export const getUserGroupDetail = async (groupId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/${groupId}`, {
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
        message: error.detail || '獲取身分組詳情失敗'
      };
    }
  } catch (error) {
    console.error('Get user group detail error:', error);
    return {
      success: false,
      message: '獲取身分組詳情失敗，請檢查網路連線'
    };
  }
};

/**
 * 建立身分組
 */
export const createUserGroup = async (groupData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groupData)
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
        message: error.detail || '建立身分組失敗'
      };
    }
  } catch (error) {
    console.error('Create user group error:', error);
    return {
      success: false,
      message: '建立身分組失敗，請檢查網路連線'
    };
  }
};

/**
 * 更新身分組
 */
export const updateUserGroup = async (groupId, groupData) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/${groupId}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groupData)
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
        message: error.detail || '更新身分組失敗'
      };
    }
  } catch (error) {
    console.error('Update user group error:', error);
    return {
      success: false,
      message: '更新身分組失敗，請檢查網路連線'
    };
  }
};

/**
 * 刪除身分組
 */
export const deleteUserGroup = async (groupId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/${groupId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });

    if (response.ok || response.status === 204) {
      return {
        success: true
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '刪除身分組失敗'
      };
    }
  } catch (error) {
    console.error('Delete user group error:', error);
    return {
      success: false,
      message: '刪除身分組失敗，請檢查網路連線'
    };
  }
};

/**
 * 加入成員到身分組
 */
export const addMemberToGroup = async (groupId, userId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/${groupId}/members/${userId}`, {
      method: 'POST',
      headers: getAuthHeader()
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '加入成員失敗'
      };
    }
  } catch (error) {
    console.error('Add member to group error:', error);
    return {
      success: false,
      message: '加入成員失敗，請檢查網路連線'
    };
  }
};

/**
 * 從身分組移除成員
 */
export const removeMemberFromGroup = async (groupId, userId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });

    if (response.ok || response.status === 204) {
      return {
        success: true
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '移除成員失敗'
      };
    }
  } catch (error) {
    console.error('Remove member from group error:', error);
    return {
      success: false,
      message: '移除成員失敗，請檢查網路連線'
    };
  }
};

/**
 * 設定檔案的身分組權限
 */
export const setFileUserGroupPermissions = async (fileId, userGroupIds) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/files/permissions`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_id: fileId,
        user_group_ids: userGroupIds
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '設定檔案權限失敗'
      };
    }
  } catch (error) {
    console.error('Set file user group permissions error:', error);
    return {
      success: false,
      message: '設定檔案權限失敗，請檢查網路連線'
    };
  }
};

/**
 * 批次設定檔案的身分組權限
 */
export const batchSetFileUserGroupPermissions = async (fileIds, userGroupIds) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/files/permissions/batch`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_ids: fileIds,
        user_group_ids: userGroupIds
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '批次設定檔案權限失敗'
      };
    }
  } catch (error) {
    console.error('Batch set file user group permissions error:', error);
    return {
      success: false,
      message: '批次設定檔案權限失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得檔案的身分組權限列表
 */
export const getFileUserGroupPermissions = async (fileId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/user-groups/files/${fileId}/permissions`, {
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
        message: error.detail || '獲取檔案權限失敗'
      };
    }
  } catch (error) {
    console.error('Get file user group permissions error:', error);
    return {
      success: false,
      message: '獲取檔案權限失敗，請檢查網路連線'
    };
  }
};
