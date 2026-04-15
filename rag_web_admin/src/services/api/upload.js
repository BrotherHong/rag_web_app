/**
 * Batch Upload API Module
 * 負責處理批次上傳相關功能
 */

import { ROLES, checkPermission } from '../utils/permissions.js';
import { apiFetch } from '../apiClient.js';
import { PathUtils } from '../../config/config.js';

// API Base URL（實際應用中應該從環境變數讀取）
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

const normalizeBatchSnapshot = (snapshot) => {
  const items = [...(snapshot.items || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
  const canceledFiles = snapshot.canceled_files || 0;
  const failedFiles = snapshot.failed_files || 0;

  return {
    taskId: snapshot.batch_id,
    batchId: snapshot.batch_id,
    status: snapshot.status,
    totalFiles: snapshot.total_files || 0,
    processedFiles: snapshot.processed_files || 0,
    successFiles: snapshot.success_files || 0,
    failedFiles,
    canceledFiles,
    deletedFiles: 0,
    files: items.map((item) => ({
      fileId: item.file_id,
      name: item.filename,
      status: item.status === 'queued' ? 'pending' : item.status,
      progress: item.processing_progress || 0,
      step: item.processing_step || null,
      error: item.error_message || null
    })),
    updatedAt: snapshot.updated_at || null
  };
};

const parseSSEBlock = (block) => {
  const lines = block.split('\n');
  let eventName = 'message';
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      return;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join('\n');
  let payload = rawData;
  try {
    payload = JSON.parse(rawData);
  } catch {
    // 非 JSON data 保留原字串
  }

  return {
    event: eventName,
    data: payload
  };
};

/**
 * 檢查重複檔案並找出相關檔案
 * @param {Array} fileList - 待檢查的檔案列表 [{ name, size, type }]
 * @returns {Promise} 檢查結果，包含重複和相關檔案
 */
export const checkDuplicates = async (fileList) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/check-duplicates`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filenames: fileList.map(f => f.name) })
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { results: [{fileName, isDuplicate, duplicateFile, relatedFiles, suggestReplace}] }
      return {
        success: true,
        data: data.results || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '檢查重複檔案失敗'
      };
    }
  } catch (error) {
    console.error('Check duplicates error:', error);
    return {
      success: false,
      message: '檢查重複檔案失敗，請檢查網路連線'
    };
  }
};

/**
 * 批次上傳檔案到知識庫
 * @param {Object} uploadData - { files: File[], categories: {}, removeFileIds: [] }
 * @returns {Promise} 上傳任務 ID
 */
export const batchUpload = async (uploadData) => {
  try {
    // 權限檢查：需要 admin 權限
    const permission = checkPermission(ROLES.ADMIN);
    if (!permission.hasPermission) {
      return {
        success: false,
        message: permission.message
      };
    }
    
    const formData = new FormData();
    uploadData.files.forEach(file => formData.append('files', file));
    formData.append('categories', JSON.stringify(uploadData.categories || {}));
    formData.append('removeFileIds', JSON.stringify(uploadData.removeFileIds || []));
    
    // 添加身分組 IDs
    if (uploadData.userGroupIds && uploadData.userGroupIds.length > 0) {
      formData.append('user_group_ids', JSON.stringify(uploadData.userGroupIds));
    }
    
    formData.append('startProcessing', 'true');
    
    const response = await apiFetch(`${API_BASE_URL}/upload/batch`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { taskId, message }
      return {
        success: true,
        data: {
          taskId: data.taskId,
          batchId: data.batchId || data.taskId,
          message: data.message || '上傳任務已建立，開始處理檔案'
        }
      };
    } else if (response.status === 413) {
      return {
        success: false,
        message: '檔案太大，超過伺服器上傳限制，請嘗試減少檔案數量或大小'
      };
    } else {
      try {
        const error = await response.json();
        return {
          success: false,
          message: error.detail || '建立上傳任務失敗'
        };
      } catch {
        return {
          success: false,
          message: `建立上傳任務失敗（HTTP ${response.status}）`
        };
      }
    }
  } catch (error) {
    console.error('Batch upload error:', error);
    return {
      success: false,
      message: '建立上傳任務失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得上傳任務進度
 * @param {string} taskId - 任務 ID
 * @returns {Promise} 任務進度資訊
 */
export const getUploadProgress = async (taskId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/progress/${taskId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const result = await response.json();
      // 後端返回: { success: true, data: { taskId, status, totalFiles, ... } }
      return {
        success: true,
        data: result.data  // 提取 data 欄位
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取上傳進度失敗'
      };
    }
  } catch (error) {
    console.error('Get upload progress error:', error);
    return {
      success: false,
      message: '獲取上傳進度失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得批次快照進度（新流程）
 * @param {string} batchId - 批次 ID
 * @returns {Promise} 任務進度資訊（格式與 getUploadProgress 一致）
 */
export const getBatchSnapshotProgress = async (batchId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/batches/${batchId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        data: normalizeBatchSnapshot(result.data || {})
      };
    }

    const error = await response.json();
    return {
      success: false,
      message: error.detail || '獲取批次進度失敗'
    };
  } catch (error) {
    console.error('Get batch snapshot progress error:', error);
    return {
      success: false,
      message: '獲取批次進度失敗，請檢查網路連線'
    };
  }
};

/**
 * 取得任務進度（優先新批次快照 API，失敗時回退舊 API）
 * @param {string} taskId - 任務/批次 ID
 * @returns {Promise} 任務進度資訊
 */
export const getTaskProgress = async (taskId) => {
  const batchResponse = await getBatchSnapshotProgress(taskId);
  if (batchResponse.success) {
    return batchResponse;
  }

  return getUploadProgress(taskId);
};

/**
 * 取消批次處理任務
 * @param {string} batchId - 批次 ID
 * @returns {Promise}
 */
export const cancelBatchTask = async (batchId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/batches/${batchId}/cancel`, {
      method: 'POST',
      headers: getAuthHeader()
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        data: normalizeBatchSnapshot(result.data || {}),
        message: result.message || '已取消批次任務'
      };
    }

    const error = await response.json();
    return {
      success: false,
      message: error.detail || '取消任務失敗'
    };
  } catch (error) {
    console.error('Cancel batch task error:', error);
    return {
      success: false,
      message: '取消任務失敗，請檢查網路連線'
    };
  }
};

/**
 * 取消單一檔案處理任務
 * @param {string} batchId - 批次 ID
 * @param {number} fileId - 檔案 ID
 * @returns {Promise}
 */
export const cancelSingleFileTask = async (batchId, fileId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/batches/${batchId}/files/${fileId}/cancel`, {
      method: 'POST',
      headers: getAuthHeader()
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        data: normalizeBatchSnapshot(result.data || {}),
        message: result.message || '已取消單一檔案任務'
      };
    }

    const error = await response.json();
    return {
      success: false,
      message: error.detail || '取消單一檔案失敗'
    };
  } catch (error) {
    console.error('Cancel single file task error:', error);
    return {
      success: false,
      message: '取消單一檔案失敗，請檢查網路連線'
    };
  }
};

/**
 * 訂閱批次 SSE 事件（可攜帶 Authorization 標頭）
 * @param {string} batchId - 批次 ID
 * @param {Object} options - 訂閱選項
 * @returns {Promise<{success:boolean,aborted?:boolean,message?:string}>}
 */
export const subscribeBatchEvents = async (batchId, options = {}) => {
  const {
    signal,
    onOpen,
    onSnapshot,
    onProgress,
    onError,
    onEvent,
  } = options;

  try {
    const response = await apiFetch(`${API_BASE_URL}/batches/${batchId}/events`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Accept': 'text/event-stream'
      },
      signal,
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText || `SSE 連線失敗 (${response.status})`;
      onError?.(new Error(message));
      return { success: false, message };
    }

    if (!response.body) {
      const message = '瀏覽器不支援 SSE 串流回應';
      onError?.(new Error(message));
      return { success: false, message };
    }

    onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const parsed = parseSSEBlock(block.replace(/\r/g, ''));
        if (!parsed) continue;

        onEvent?.(parsed);

        if (parsed.event === 'snapshot' && typeof parsed.data === 'object' && parsed.data) {
          onSnapshot?.(normalizeBatchSnapshot(parsed.data));
          continue;
        }

        if (parsed.event === 'progress') {
          onProgress?.(parsed.data);
        }
      }
    }

    return { success: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, aborted: true };
    }

    onError?.(error);
    return {
      success: false,
      message: error.message || 'SSE 連線失敗'
    };
  }
};

/**
 * 取得使用者的所有上傳任務
 * @returns {Promise} 任務列表
 */
export const getUserUploadTasks = async () => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/tasks`, {
      method: 'GET',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      // 後端返回: { items: [...] }
      return {
        success: true,
        data: data.items || []
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '獲取上傳任務列表失敗'
      };
    }
  } catch (error) {
    console.error('Get user upload tasks error:', error);
    return {
      success: false,
      message: '獲取上傳任務列表失敗，請檢查網路連線'
    };
  }
};

/**
 * 刪除已完成的上傳任務記錄
 * @param {string} taskId - 任務 ID
 * @returns {Promise} 刪除結果
 */
export const deleteUploadTask = async (taskId) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/upload/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '任務記錄已刪除'
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.detail || '刪除任務失敗'
      };
    }
  } catch (error) {
    console.error('Delete upload task error:', error);
    return {
      success: false,
      message: '刪除任務失敗，請檢查網路連線'
    };
  }
};
