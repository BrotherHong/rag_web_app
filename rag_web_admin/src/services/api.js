/**
 * Main API Module
 * 統一導出所有 API 函數
 * 已完成完整模組化重構
 */

// 導入認證模組
export { login, logout, verifyToken } from './api/auth.js';

// 導入檔案管理模組
export { getFiles, uploadFile, deleteFile, downloadFile } from './api/files.js';

// 導入分類管理模組
export { getCategories, getCategoriesWithDetails, addCategory, deleteCategory, getCategoryStats } from './api/categories.js';

// 導入活動與統計模組
export { getStatistics, getRecentActivities, getAllActivities } from './api/activities.js';

// 導入批次上傳模組
export { checkDuplicates, batchUpload, getUploadProgress, getUserUploadTasks, deleteUploadTask } from './api/upload.js';

// 導入使用者管理模組
export { getUsers, addUser, updateUser, deleteUser, getUsersByDepartment } from './api/users.js';

// 導入系統設定模組
export { getSettings, updateSettings, getBackupHistory, createBackup, restoreBackup, getSystemInfo } from './api/settings.js';

// 導入處室管理模組
export { getDepartments, getDepartmentById, addDepartment, updateDepartment, deleteDepartment, getDepartmentStats } from './api/departments.js';

// 導入 FAQ 管理模組
export { getFaqs, addFaq, updateFaq, deleteFaq, toggleFaqStatus, updateFaqOrder } from './api/faqs.js';

