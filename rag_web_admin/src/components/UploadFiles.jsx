import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { checkDuplicates, batchUpload, getTaskProgress, cancelBatchTask, cancelSingleFileTask, subscribeBatchEvents, getCategories, getUserGroups } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useModalAnimation } from '../hooks/useModalAnimation';
import ConfirmDialog from './common/ConfirmDialog';

const TERMINAL_STATUS = new Set(['completed', 'partial', 'failed', 'canceled']);
const CANCEL_ALLOWED_STEPS = new Set(['', 'classify', 'prepare', 'convert', 'summarize', 'queued', 'pending']);
const ACTIVE_UPLOAD_TASK_STORAGE_KEY = 'admin.activeUploadTaskId';
const STEP_LABELS = {
  classify: '分類檢查',
  prepare: '準備中',
  convert: '轉檔中',
  summarize: '摘要中',
  embed: '嵌入中',
  finalize: '整理輸出中',
  completed: '完成',
  failed: '失敗',
  canceled: '已取消',
  pending: '等待中',
};

const UploadFiles = ({ onNavigateToKnowledgeBase }) => {
  const toast = useToast();
  
  // 檔案選擇與管理
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fileCategories, setFileCategories] = useState({});
  const [userGroups, setUserGroups] = useState([]);
  const [selectedUserGroups, setSelectedUserGroups] = useState([]);
  
  // 重複檢查結果
  const [duplicateCheckResults, setDuplicateCheckResults] = useState([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  
  // 上傳狀態
  const [uploading, setUploading] = useState(false);
  const [uploadTaskId, setUploadTaskId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  
  // UI 狀態
  const [currentStep, setCurrentStep] = useState(1); // 1: 選擇檔案, 2: 檢查重複, 3: 上傳中, 4: 結果摘要
  const [showSummary, setShowSummary] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [isDragging, setIsDragging] = useState(false); // 拖曳狀態
  const dragCounterRef = useRef(0); // 用於追蹤拖曳進入/離開的次數
  const fileInputRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const snapshotGuardTimerRef = useRef(null);
  const sseAbortControllerRef = useRef(null);
  const taskTerminatedByErrorRef = useRef(false);
  const lastSnapshotFetchRef = useRef(0);
  const stableOrderRef = useRef(new Map());
  const stableOrderCounterRef = useRef(0);
  const cancelConfirmModal = useModalAnimation(cancelConfirm !== null, () => setCancelConfirm(null));

  const isCancelBlocked = useCallback((file) => {
    if (!file) return false;
    if (file.status === 'pending') return false;
    if (file.status !== 'processing') return true;
    const step = (file.step || '').toLowerCase();
    return !CANCEL_ALLOWED_STEPS.has(step);
  }, []);

  const hasCancelableFiles = useMemo(() => {
    if (!uploadProgress?.files?.length) return false;
    return uploadProgress.files.some((file) => {
      if (!file?.fileId) return false;
      if (!(file.status === 'processing' || file.status === 'pending')) return false;
      return !isCancelBlocked(file);
    });
  }, [uploadProgress, isCancelBlocked]);
  
  // 載入分類列表和身分組列表
  useEffect(() => {
    loadCategories();
    loadUserGroups();
  }, []);

  // 進入頁面時恢復進行中的上傳任務（支援切頁/重整）
  useEffect(() => {
    let cancelled = false;

    const restoreActiveTask = async () => {
      const storedTaskId = localStorage.getItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
      if (!storedTaskId) return;

      setUploadTaskId(storedTaskId);
      setCurrentStep(3);

      const response = await getTaskProgress(storedTaskId);
      if (cancelled) return;

      if (!response.success) {
        localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
        return;
      }

      setUploadProgress(response.data);

      if (TERMINAL_STATUS.has(response.data.status)) {
        localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
        setUploading(false);
        setShowSummary(true);
        setCurrentStep(4);
      } else {
        setUploading(true);
        setShowSummary(false);
      }
    };

    restoreActiveTask();

    return () => {
      cancelled = true;
    };
  }, []);

  // 獲取上傳進度
  const fetchUploadProgress = useCallback(async (taskIdOverride = null) => {
    const taskId = taskIdOverride || uploadTaskId;
    if (!taskId) return;

    const response = await getTaskProgress(taskId);

    if (response.success) {
      taskTerminatedByErrorRef.current = false;
      setUploadProgress(response.data);

      // 檢查是否完成
      if (TERMINAL_STATUS.has(response.data.status)) {
        localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
        setUploading(false);
        setShowSummary(true);
        setCurrentStep(4); // 進入結果摘要步驟
      } else {
        localStorage.setItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY, taskId);
      }
      return;
    }

    if (taskTerminatedByErrorRef.current) {
      return;
    }

    taskTerminatedByErrorRef.current = true;
    localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);

    setUploadProgress((prev) => ({
      taskId,
      batchId: taskId,
      status: 'failed',
      totalFiles: prev?.totalFiles || 0,
      processedFiles: prev?.processedFiles || 0,
      successFiles: prev?.successFiles || 0,
      failedFiles: Math.max(1, prev?.failedFiles || 0),
      deletedFiles: prev?.deletedFiles || 0,
      files: prev?.files || [],
      updatedAt: new Date().toISOString(),
      errorMessage: response.message || '任務狀態取得失敗，可能因後端重啟或任務已中斷。',
    }));
    setUploading(false);
    setShowSummary(true);
    setCurrentStep(4);
    toast.warning(response.message || '任務狀態取得失敗，已停止即時追蹤。');
  }, [uploadTaskId]);
  
  // 即時進度（SSE 優先，失敗時回退輪詢）
  useEffect(() => {
    if (!uploadTaskId || !uploading) {
      return;
    }

    let unmounted = false;
    let fallbackStarted = false;

    const clearPolling = () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const clearSnapshotGuard = () => {
      if (snapshotGuardTimerRef.current) {
        clearInterval(snapshotGuardTimerRef.current);
        snapshotGuardTimerRef.current = null;
      }
    };

    const startPollingFallback = () => {
      if (fallbackStarted || unmounted || !uploading) {
        return;
      }

      fallbackStarted = true;
      clearPolling();

      pollingTimerRef.current = setInterval(() => {
        fetchUploadProgress(uploadTaskId);
      }, 1000);
    };

    // 先抓一次快照，避免等待 SSE 第一包資料
    fetchUploadProgress(uploadTaskId);

    // 保底同步：即使 SSE 連線沒斷、但漏事件，也定期抓快照避免 UI 卡住
    snapshotGuardTimerRef.current = setInterval(() => {
      fetchUploadProgress(uploadTaskId);
    }, 5000);

    const abortController = new AbortController();
    sseAbortControllerRef.current = abortController;

    subscribeBatchEvents(uploadTaskId, {
      signal: abortController.signal,
      onSnapshot: (snapshot) => {
        if (unmounted) return;
        setUploadProgress(snapshot);

        if (TERMINAL_STATUS.has(snapshot.status)) {
          localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
          setUploading(false);
          setShowSummary(true);
          setCurrentStep(4);
        }
      },
      onProgress: () => {
        if (unmounted) return;
        // 進度事件只提供增量，節流後抓快照同步完整狀態
        const now = Date.now();
        if (now - lastSnapshotFetchRef.current >= 400) {
          lastSnapshotFetchRef.current = now;
          fetchUploadProgress(uploadTaskId);
        }
      },
      onError: () => {
        if (unmounted) return;
        startPollingFallback();
      },
    }).then((result) => {
      if (unmounted || abortController.signal.aborted) {
        return;
      }

      if (!result.success && !result.aborted) {
        startPollingFallback();
        return;
      }

      // SSE 有可能被 proxy/network 主動關閉且不會觸發 onError。
      // 這時先補抓一次快照，再切到輪詢，避免畫面停在舊進度。
      fetchUploadProgress(uploadTaskId);
      startPollingFallback();
    });

    return () => {
      unmounted = true;
      clearPolling();
      clearSnapshotGuard();

      if (sseAbortControllerRef.current) {
        sseAbortControllerRef.current.abort();
        sseAbortControllerRef.current = null;
      }
    };
  }, [uploadTaskId, uploading, fetchUploadProgress]);
  
  const loadCategories = async () => {
    const response = await getCategories();
    if (response.success) {
      setCategories(response.data);
    }
  };
  
  const loadUserGroups = async () => {
    const response = await getUserGroups(false);
    if (response.success) {
      setUserGroups(response.data);
    }
  };
  
  // 處理檔案選擇
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    addFiles(files);
    
    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // 通用的加入檔案邏輯
  const addFiles = (files) => {
    const rejected = [];
    const valid = [];

    files.forEach(file => {
      if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) return;
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        rejected.push(`${file.name}（不支援的格式）`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}（超過 10MB 單檔限制）`);
        return;
      }
      valid.push(file);
    });

    if (rejected.length > 0) {
      toast.error(`以下檔案無法加入：\n${rejected.join('\n')}`);
    }

    if (valid.length > 0) {
      setSelectedFiles(prev => [...prev, ...valid]);
      const newCategories = { ...fileCategories };
      valid.forEach(file => {
        if (!newCategories[file.name]) newCategories[file.name] = '其他';
      });
      setFileCategories(newCategories);
    }
  };
  
  // 處理拖曳進入
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };
  
  // 處理拖曳經過
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  // 處理拖曳離開
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };
  
  // 處理拖曳放下
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };
  
  // 移除選中的檔案
  const removeFile = (fileName) => {
    setSelectedFiles(prev => prev.filter(f => f.name !== fileName));
    const newCategories = { ...fileCategories };
    delete newCategories[fileName];
    setFileCategories(newCategories);
  };
  
  // 更新檔案分類
  const updateFileCategory = (fileName, category) => {
    setFileCategories(prev => ({
      ...prev,
      [fileName]: category
    }));
  };
  
  // 批量設定檔案分類
  const batchSetCategory = (category) => {
    const newCategories = {};
    selectedFiles.forEach(file => {
      newCategories[file.name] = category;
    });
    setFileCategories(newCategories);
  };
  
  // 檢查重複檔案
  const handleCheckDuplicates = async () => {
    if (selectedFiles.length === 0) {
      toast.warning('請先選擇檔案');
      return;
    }
    
    setCheckingDuplicates(true);
    
    const fileList = selectedFiles.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type
    }));
    
    const response = await checkDuplicates(fileList);
    
    if (response.success) {
      setDuplicateCheckResults(response.data);
      setCurrentStep(2);
    } else {
      toast.error('檢查重複檔案失敗：' + response.message);
    }
    
    setCheckingDuplicates(false);
  };
  
  // 開始批次上傳
  const handleStartUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.warning('沒有可上傳的檔案');
      return;
    }
    
    setUploading(true);
    setCurrentStep(3);
    
    const uploadData = {
      files: selectedFiles,
      categories: fileCategories,
      userGroupIds: selectedUserGroups
    };
    
    const response = await batchUpload(uploadData);
    
    if (response.success) {
      const taskId = response.data.batchId || response.data.taskId;
      taskTerminatedByErrorRef.current = false;
      setUploadTaskId(taskId);
      localStorage.setItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY, taskId);
      toast.success('上傳任務已建立');
      fetchUploadProgress(taskId);
    } else {
      localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
      toast.error('建立上傳任務失敗：' + response.message);
      setUploading(false);
    }
  };
  
  // 繼續上傳其他檔案
  const handleContinueUpload = () => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    if (snapshotGuardTimerRef.current) {
      clearInterval(snapshotGuardTimerRef.current);
      snapshotGuardTimerRef.current = null;
    }

    if (sseAbortControllerRef.current) {
      sseAbortControllerRef.current.abort();
      sseAbortControllerRef.current = null;
    }

    localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
    taskTerminatedByErrorRef.current = false;

    setSelectedFiles([]);
    setFileCategories({});
    setDuplicateCheckResults([]);
    setUploadTaskId(null);
    setUploadProgress(null);
    setCurrentStep(1);
    setUploading(false);
    setShowSummary(false);
  };

  const handleCancelProcessing = async () => {
    if (!uploadTaskId || !uploading) {
      return;
    }

    if (!hasCancelableFiles) {
      toast.warning('目前檔案已進入模型回應或後處理階段，無可取消項目。');
      return;
    }

    setCancelConfirm({ type: 'batch' });
  };

  const handleCancelSingleFile = async (file) => {
    if (!uploadTaskId || !uploading || !file?.fileId) {
      return;
    }

    if (isCancelBlocked(file)) {
      toast.warning('此檔案已進入模型回應或後處理階段，無法取消。');
      return;
    }

    setCancelConfirm({ type: 'file', file });
  };

  const handleConfirmCancel = async () => {
    if (!cancelConfirm || !uploadTaskId) {
      return;
    }

    if (cancelConfirm.type === 'batch') {
      const response = await cancelBatchTask(uploadTaskId);
      if (!response.success) {
        toast.error(`取消失敗：${response.message}`);
        return;
      }

      setUploadProgress(response.data);

      if (TERMINAL_STATUS.has(response.data.status)) {
        setUploading(false);
        setShowSummary(true);
        setCurrentStep(4);
        localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
      }

      if (response.message?.includes('無法取消') || response.message?.includes('終態')) {
        toast.warning(response.message);
      } else {
        toast.success(response.message || '批次任務已取消');
      }
      return;
    }

    const file = cancelConfirm.file;
    const response = await cancelSingleFileTask(uploadTaskId, file.fileId);
    if (!response.success) {
      toast.error(`取消單檔失敗：${response.message}`);
      return;
    }

    setUploadProgress(response.data);

    if (response.message?.includes('無法取消') || response.message?.includes('終態')) {
      toast.warning(response.message);
    } else {
      toast.success(response.message || `已取消 ${file.name}`);
    }

    if (TERMINAL_STATUS.has(response.data.status)) {
      setUploading(false);
      setShowSummary(true);
      setCurrentStep(4);
      localStorage.removeItem(ACTIVE_UPLOAD_TASK_STORAGE_KEY);
    }
  };
  
  // 格式化檔案大小
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };
  
  // 根據檔案類型返回圖示
  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    
    // PDF 檔案
    if (ext === 'pdf') {
      return (
        <svg className="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    
    // Word 文件
    if (ext === 'doc' || ext === 'docx') {
      return (
        <svg className="w-10 h-10 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    
    // Excel 試算表
    if (ext === 'xls' || ext === 'xlsx') {
      return (
        <svg className="w-10 h-10 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    
    // PowerPoint 簡報
    if (ext === 'ppt' || ext === 'pptx') {
      return (
        <svg className="w-10 h-10 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    
    // 文字檔案
    if (ext === 'txt') {
      return (
        <svg className="w-10 h-10 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    
    // 其他類型（預設圖示）
    return (
      <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    );
  };
  
  // 計算總體進度
  const calculateOverallProgress = () => {
    if (!uploadProgress || uploadProgress.totalFiles === 0) return 0;
    return Math.round((uploadProgress.processedFiles / uploadProgress.totalFiles) * 100);
  };

  const getStepLabel = (file) => {
    if (file.step && STEP_LABELS[file.step]) {
      return STEP_LABELS[file.step];
    }

    if (file.status === 'completed') return STEP_LABELS.completed;
    if (file.status === 'failed') return STEP_LABELS.failed;
    if (file.status === 'processing') return '處理中';
    return STEP_LABELS.pending;
  };

  const getStatusRank = (file) => {
    if (file.status === 'completed') return 0;
    if (file.status === 'processing') return 1;
    if (file.status === 'failed' || file.status === 'canceled') return 2;
    return 3;
  };

  const sortedProgressFiles = useMemo(() => {
    const files = uploadProgress?.files || [];

    files.forEach((file) => {
      const key = file.name;
      if (!stableOrderRef.current.has(key)) {
        stableOrderRef.current.set(key, stableOrderCounterRef.current++);
      }
    });

    return [...files].sort((a, b) => {
      const rankDiff = getStatusRank(a) - getStatusRank(b);
      if (rankDiff !== 0) return rankDiff;

      // 以 10% 區間排序降低跳動，仍維持完成度較高靠前
      const aBucket = Math.floor((a.progress || 0) / 10);
      const bBucket = Math.floor((b.progress || 0) / 10);
      if (aBucket !== bBucket) return bBucket - aBucket;

      const aOrder = stableOrderRef.current.get(a.name) ?? 0;
      const bOrder = stableOrderRef.current.get(b.name) ?? 0;
      return aOrder - bOrder;
    });
  }, [uploadProgress]);
  
  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">上傳檔案到知識庫</h1>
        <p className="mt-2 text-sm text-gray-600">
          支援批次上傳多個檔案,系統會自動檢查重複並提供建議
        </p>
      </div>
      
      {/* 步驟指示器 */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-5 lg:p-6">
        <div className="flex items-center justify-center space-x-3">
          <div className={`flex items-center ${currentStep >= 1 ? '' : 'text-gray-600'}`}
               style={currentStep >= 1 ? { color: 'var(--ncku-red)' } : {}}>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm sm:text-base ${
              currentStep >= 1 ? 'text-white' : 'border-gray-400 bg-gray-100 text-gray-600'
            }`}
            style={currentStep >= 1 ? { 
              borderColor: 'var(--ncku-red)', 
              backgroundColor: 'var(--ncku-red)' 
            } : {}}>
              1
            </div>
            <span className="ml-2 font-medium text-sm">選擇檔案</span>
          </div>
          
          <div className={`w-12 h-1 ${currentStep >= 2 ? '' : 'bg-gray-300'}`}
               style={currentStep >= 2 ? { backgroundColor: 'var(--ncku-red)' } : {}}></div>
          
          <div className={`flex items-center ${currentStep >= 2 ? '' : 'text-gray-600'}`}
               style={currentStep >= 2 ? { color: 'var(--ncku-red)' } : {}}>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm sm:text-base ${
              currentStep >= 2 ? 'text-white' : 'border-gray-400 bg-gray-100 text-gray-600'
            }`}
            style={currentStep >= 2 ? { 
              borderColor: 'var(--ncku-red)', 
              backgroundColor: 'var(--ncku-red)' 
            } : {}}>
              2
            </div>
            <span className="ml-2 font-medium text-sm">檢查重複</span>
          </div>
          
          <div className={`w-12 h-1 ${currentStep >= 3 ? '' : 'bg-gray-300'}`}
               style={currentStep >= 3 ? { backgroundColor: 'var(--ncku-red)' } : {}}></div>
          
          <div className={`flex items-center ${currentStep >= 3 ? '' : 'text-gray-600'}`}
               style={currentStep >= 3 ? { color: 'var(--ncku-red)' } : {}}>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm sm:text-base ${
              currentStep >= 3 ? 'text-white' : 'border-gray-400 bg-gray-100 text-gray-600'
            }`}
            style={currentStep >= 3 ? { 
              borderColor: 'var(--ncku-red)', 
              backgroundColor: 'var(--ncku-red)' 
            } : {}}>
              3
            </div>
            <span className="ml-2 font-medium text-sm">上傳處理</span>
          </div>
          
          <div className={`w-12 h-1 ${currentStep >= 4 ? '' : 'bg-gray-300'}`}
               style={currentStep >= 4 ? { backgroundColor: 'var(--ncku-red)' } : {}}></div>
          
          <div className={`flex items-center ${currentStep >= 4 ? '' : 'text-gray-600'}`}
               style={currentStep >= 4 ? { color: 'var(--ncku-red)' } : {}}>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm sm:text-base ${
              currentStep >= 4 ? 'text-white' : 'border-gray-400 bg-gray-100 text-gray-600'
            }`}
            style={currentStep >= 4 ? { 
              borderColor: 'var(--ncku-red)', 
              backgroundColor: 'var(--ncku-red)' 
            } : {}}>
              4
            </div>
            <span className="ml-2 font-medium text-sm">結果摘要</span>
          </div>
        </div>
      </div>
      
      {/* 步驟 1: 選擇檔案 */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* 檔案選擇器 */}
          <div 
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-all cursor-pointer shadow-sm ${
              isDragging 
                ? 'bg-red-50' 
                : 'bg-white hover:bg-gray-50'
            }`}
            style={{
              borderColor: isDragging ? 'var(--ncku-red)' : '#d1d5db',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg 
              className="mx-auto h-12 w-12 transition-colors" 
              style={{ color: isDragging ? 'var(--ncku-red)' : '#9ca3af' }}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p 
              className="mt-2 text-sm font-semibold transition-colors"
              style={{ color: isDragging ? 'var(--ncku-red)' : '#374151' }}
            >
              {isDragging ? '放開以加入檔案' : '點擊選擇檔案或拖曳檔案至此處'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              支援格式：PDF、DOC、DOCX、XLS、XLSX、TXT　｜　單檔最大 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
            />
          </div>
          
          {/* 已選擇的檔案列表 */}
          {selectedFiles.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-md">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  已選擇 {selectedFiles.length} 個檔案
                </h3>
                
                {/* 批量操作區域 */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm font-medium text-gray-700">批量操作：</span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            batchSetCategory(e.target.value);
                            e.target.value = ''; // 重置選擇
                          }
                        }}
                        className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-ncku-red cursor-pointer"
                        defaultValue=""
                      >
                        <option value="" disabled>選擇分類套用到全部檔案</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-sm text-gray-500">
                      一鍵設定所有檔案分類
                    </span>
                  </div>
                </div>

                {/* 身分組選擇區域 */}
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="mb-2">
                    <span className="text-sm font-medium text-gray-700">可訪問的身分組：</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {userGroups.map(group => (
                      <label
                        key={group.id}
                        className="flex items-center space-x-2 p-2 hover:bg-green-100 rounded-md cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserGroups.includes(group.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserGroups([...selectedUserGroups, group.id]);
                            } else {
                              setSelectedUserGroups(selectedUserGroups.filter(id => id !== group.id));
                            }
                          }}
                          className="w-4 h-4 text-ncku-red border-gray-300 rounded focus:ring-ncku-red cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 flex items-center">
                          <span
                            className="inline-block w-3 h-3 rounded-full mr-1.5"
                            style={{ backgroundColor: group.color }}
                          ></span>
                          {group.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  {userGroups.length === 0 && (
                    <p className="text-sm text-gray-500 italic">目前沒有可用的身分組</p>
                  )}
                </div>
              </div>
              
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center flex-1 min-w-0">
                      {/* 檔案類型圖示 */}
                      <div className="flex-shrink-0 mr-4">
                        {getFileIcon(file.name)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 ml-4">
                      <select
                        value={fileCategories[file.name] || '其他'}
                        onChange={(e) => updateFileCategory(file.name, e.target.value)}
                        className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-ncku-red cursor-pointer"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      
                      <button
                        onClick={() => removeFile(file.name)}
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 cursor-pointer font-medium"
                >
                  繼續選擇
                </button>
                <button
                  onClick={handleCheckDuplicates}
                  disabled={checkingDuplicates}
                  className="px-6 py-2 text-white rounded-md shadow-lg hover:shadow-xl transition-all disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer font-medium"
                  style={checkingDuplicates ? {} : { backgroundColor: 'var(--ncku-red)' }}
                >
                  {checkingDuplicates ? '檢查中...' : '下一步：檢查重複'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <svg className="h-5 w-5 text-blue-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    請先選擇要上傳的檔案
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    點擊上方區域選擇檔案，可一次選擇多個檔案或多次添加
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 步驟 2: 檢查重複 */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">重複檢查結果</h3>
              <p className="text-sm text-gray-600 mt-1">
                系統已找出可能重複或相關的檔案，請檢查並決定是否要刪除舊檔案
              </p>
            </div>
            
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {duplicateCheckResults.map((result, index) => (
                <div key={index} className="px-6 py-4">
                  <div className="flex items-start">
                    {/* 檔案類型圖示 */}
                    <div className="flex-shrink-0 mr-3">
                      <div className="scale-75">
                        {getFileIcon(result.fileName)}
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className="font-medium text-gray-900">{result.fileName}</span>
                        
                        {result.isDuplicate && (
                          <span className="ml-3 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                            完全重複
                          </span>
                        )}
                        {!result.isDuplicate && result.relatedFiles.length > 0 && (
                          <span className="ml-3 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                            找到 {result.relatedFiles.length} 個相關檔案
                          </span>
                        )}
                        {!result.isDuplicate && result.relatedFiles.length === 0 && (
                          <span className="ml-3 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                            無重複
                          </span>
                        )}
                      </div>
                      
                      {/* 顯示重複或相關的檔案 */}
                      {(result.isDuplicate || result.relatedFiles.length > 0) && (
                        <div className="mt-3 ml-7 space-y-2">
                          {result.isDuplicate && (
                            <div className="flex items-start p-3 bg-red-50 border border-red-200 rounded-md">
                              <svg className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {result.duplicateFile.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  現有檔案 · {result.duplicateFile.size} · {result.duplicateFile.uploadDate}
                                </p>
                                {result.duplicateFile.canDelete ? (
                                  <p className="text-xs text-red-600 mt-1">
                                    請先到「知識庫管理」頁面刪除此檔案，之後點「重新檢查」
                                  </p>
                                ) : (
                                  <p className="text-xs text-orange-600 mt-1">
                                    此檔案屬於其他管理組織，請聯絡對應管理員處理
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => onNavigateToKnowledgeBase(result.duplicateFile.name)}
                                className="ml-3 flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md cursor-pointer transition-colors"
                                title="跳轉至知識庫管理並搜尋此檔案"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                前往查看
                              </button>
                            </div>
                          )}
                          
                          {result.relatedFiles.map(relatedFile => (
                            <div key={relatedFile.id} className="flex items-start p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                              <svg className="w-4 h-4 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {relatedFile.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {relatedFile.size} · {relatedFile.uploadDate} · {relatedFile.category}
                                </p>
                              </div>
                              <span className="text-xs text-yellow-600 flex-shrink-0">可能相關</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {duplicateCheckResults.some(r => r.isDuplicate) ? (
                    <span className="font-medium" style={{ color: 'var(--ncku-red)' }}>
                      {duplicateCheckResults.filter(r => r.isDuplicate).length} 個檔案有衝突，將被阻擋上傳
                    </span>
                  ) : (
                    <span>所有檔案均可上傳</span>
                  )}
                </div>
                
                <div className="flex space-x-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 cursor-pointer font-medium"
                  >
                    返回修改
                  </button>
                  <button
                    onClick={handleStartUpload}
                    disabled={duplicateCheckResults.some(r => r.isDuplicate)}
                    className="px-6 py-2 text-white rounded-md shadow-lg hover:shadow-xl transition-all cursor-pointer font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    style={duplicateCheckResults.some(r => r.isDuplicate) ? { backgroundColor: '#9ca3af' } : { backgroundColor: 'var(--ncku-red)' }}
                    title={duplicateCheckResults.some(r => r.isDuplicate) ? '請先解決所有衝突檔案' : ''}
                  >
                    開始上傳到知識庫
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 步驟 3: 上傳進度 */}
      {currentStep === 3 && uploadProgress && (
        <div className="space-y-6">
          {/* 總體進度 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">上傳進度</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                uploadProgress.status === 'completed' ? 'bg-green-100 text-green-800' :
                uploadProgress.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                uploadProgress.status === 'canceled' ? 'bg-orange-100 text-orange-800' :
                uploadProgress.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {uploadProgress.status === 'completed' ? '✓ 全部完成' :
                 uploadProgress.status === 'processing' ? '⟳ 處理中...' :
                 uploadProgress.status === 'canceled' ? '⏹ 已取消' :
                 uploadProgress.status === 'partial' ? '⚠ 部分失敗' :
                 '等待中'}
              </span>
            </div>

            {uploading && uploadProgress.status === 'processing' && (
              <div className="mb-4">
                <button
                  onClick={handleCancelProcessing}
                  disabled={!hasCancelableFiles}
                  className={`px-4 py-2 border rounded-md font-medium ${hasCancelableFiles
                    ? 'border-red-300 text-red-700 hover:bg-red-50 cursor-pointer'
                    : 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'}`}
                >
                  取消處理
                </button>
                {!hasCancelableFiles && (
                  <p className="text-xs text-gray-500 mt-2">目前檔案已進入模型回應或後處理階段，取消已停用。</p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  已處理 {uploadProgress.processedFiles} / {uploadProgress.totalFiles} 個檔案
                </span>
                <span>{calculateOverallProgress()}%</span>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{ 
                    width: `${calculateOverallProgress()}%`,
                    backgroundColor: 'var(--ncku-red)'
                  }}
                ></div>
              </div>
              
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>成功: {uploadProgress.successFiles}</span>
                <span>失敗: {uploadProgress.failedFiles}</span>
                <span>取消: {uploadProgress.canceledFiles || 0}</span>
              </div>
            </div>
          </div>
          
          {/* 檔案詳細進度 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">檔案處理詳情</h3>
            </div>
            
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {sortedProgressFiles.map((file, index) => (
                <div key={index} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center flex-1 min-w-0">
                      {file.status === 'completed' && (
                        <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                      {file.status === 'processing' && (
                        <svg className="w-5 h-5 mr-2 flex-shrink-0 animate-spin" style={{ color: 'var(--ncku-red)' }} fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {file.status === 'failed' && (
                        <svg className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      {file.status === 'pending' && (
                        <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                      )}
                      
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {uploading && (file.status === 'processing' || file.status === 'pending') && file.fileId && (
                        <button
                          onClick={() => handleCancelSingleFile(file)}
                          disabled={isCancelBlocked(file)}
                          className={`px-2 py-1 border rounded text-xs ${isCancelBlocked(file)
                            ? 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                            : 'border-orange-300 text-orange-700 hover:bg-orange-50 cursor-pointer'}`}
                          title={isCancelBlocked(file) ? '已進入模型回應或後處理階段，無法取消' : ''}
                        >
                          取消此檔
                        </button>
                      )}

                      <span className="text-xs text-gray-500">
                        {file.status === 'completed' ? '完成' :
                         file.status === 'processing' ? `${file.progress}%` :
                         file.status === 'canceled' ? '已取消' :
                         file.status === 'failed' ? '失敗' :
                         '等待中'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mb-2">
                    目前步驟：{getStepLabel(file)}
                  </p>
                  
                  {file.status === 'processing' && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-full transition-all duration-300 rounded-full"
                        style={{
                          width: `${file.progress}%`,
                          backgroundColor: 'var(--ncku-red)'
                        }}
                      ></div>
                    </div>
                  )}
                  
                  {file.status === 'failed' && file.error && (
                    <p className="text-xs text-red-600 mt-1">{file.error}</p>
                  )}

                  {file.status === 'canceled' && (
                    <p className="text-xs text-orange-600 mt-1">已手動取消處理</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* 完成提示 - 移除此按鈕，因為會自動進入步驟 4 */}
        </div>
      )}
      
      {/* 步驟 4: 結果摘要 */}
      {currentStep === 4 && uploadProgress && showSummary && (
        <div className="space-y-6">
          {/* 上傳結果摘要卡片 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 lg:p-6 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">上傳結果摘要</h3>
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                uploadProgress.status === 'completed' ? 'bg-green-100 text-green-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {uploadProgress.status === 'completed' ? '✓ 全部成功' : '⚠ 部分失敗'}
              </span>
            </div>
            
            {/* 統計資訊 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-green-700">{uploadProgress.successFiles}</div>
                <div className="text-xs sm:text-sm text-green-600 mt-1">成功上傳</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-red-700">{uploadProgress.failedFiles}</div>
                <div className="text-xs sm:text-sm text-red-600 mt-1">上傳失敗</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-orange-700">{uploadProgress.canceledFiles || 0}</div>
                <div className="text-xs sm:text-sm text-orange-600 mt-1">已取消</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-blue-700">{uploadProgress.deletedFiles || 0}</div>
                <div className="text-xs sm:text-sm text-blue-600 mt-1">已刪除舊檔</div>
              </div>
            </div>
            
            {/* 失敗檔案列表 */}
            {uploadProgress.failedFiles > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-red-700 mb-3">失敗檔案列表</h4>
                <div className="bg-red-50 border border-red-200 rounded-lg divide-y divide-red-200">
                  {uploadProgress.files
                    .filter(file => file.status === 'failed')
                    .map((file, index) => (
                      <div key={index} className="px-4 py-3">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-shrink-0 mr-2 scale-50 -ml-2">
                            {getFileIcon(file.name)}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{file.name}</p>
                            {file.error && (
                              <p className="text-xs text-red-600 mt-1">{file.error}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {(uploadProgress.canceledFiles || 0) > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-orange-700 mb-3">取消檔案列表</h4>
                <div className="bg-orange-50 border border-orange-200 rounded-lg divide-y divide-orange-200">
                  {uploadProgress.files
                    .filter(file => file.status === 'canceled')
                    .map((file, index) => (
                      <div key={index} className="px-4 py-3">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-orange-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-shrink-0 mr-2 scale-50 -ml-2">
                            {getFileIcon(file.name)}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{file.name}</p>
                            <p className="text-xs text-orange-600 mt-1">已手動取消處理</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            
            {/* 成功檔案列表 */}
            {uploadProgress.successFiles > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-green-700 mb-3">成功上傳檔案</h4>
                <div className="bg-green-50 border border-green-200 rounded-lg divide-y divide-green-200 max-h-64 overflow-y-auto">
                  {uploadProgress.files
                    .filter(file => file.status === 'completed')
                    .map((file, index) => (
                      <div key={index} className="px-4 py-3">
                        <div className="flex items-center">
                          <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-shrink-0 mr-2 scale-50 -ml-2">
                            {getFileIcon(file.name)}
                          </div>
                          <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          
          {/* 操作按鈕 */}
          <div className="flex justify-center gap-4">
            <button
              onClick={() => onNavigateToKnowledgeBase && onNavigateToKnowledgeBase()}
              className="px-8 py-3 text-white rounded-md shadow-lg hover:shadow-xl transition-all cursor-pointer font-medium flex items-center gap-2"
              style={{ backgroundColor: 'var(--ncku-red)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              前往知識庫查看
            </button>
            
            <button
              onClick={handleContinueUpload}
              className="px-8 py-3 bg-white border-2 rounded-md shadow-md hover:shadow-lg transition-all cursor-pointer font-medium flex items-center gap-2"
              style={{ borderColor: 'var(--ncku-red)', color: 'var(--ncku-red)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              繼續上傳其他檔案
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={cancelConfirm !== null}
        shouldRender={cancelConfirmModal.shouldRender}
        isClosing={cancelConfirmModal.isClosing}
        animationClass={cancelConfirmModal.animationClass}
        contentAnimationClass={cancelConfirmModal.contentAnimationClass}
        onClose={cancelConfirmModal.handleClose}
        onConfirm={handleConfirmCancel}
        title="確認取消"
        message={cancelConfirm?.type === 'batch'
          ? '確定要取消目前批次處理嗎？\n已完成的檔案會保留，處理中的檔案將停止。'
          : `確定要取消「${cancelConfirm?.file?.name || ''}」嗎？\n此檔案會停止後續處理。`}
        confirmText="確認取消"
        cancelText="取消"
        type="danger"
      />
    </div>
  );
};

export default UploadFiles;
