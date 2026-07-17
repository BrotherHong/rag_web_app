import { useState, useEffect } from 'react';
import { getFiles, deleteFile, downloadFile, updateFile, getCategoriesWithDetails } from '../services/api';
import { getAdminGroups } from '../services/api/adminGroups';
import { getUserGroups, getFileUserGroupPermissions, setFileUserGroupPermissions } from '../services/api/userGroups';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useToast } from '../contexts/ToastContext';

function KnowledgeBase({ initialSearch, onSearchConsumed }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryMap, setCategoryMap] = useState({}); // 用於儲存分類名稱到顏色的對應
  const [userGroups, setUserGroups] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all'); // 使用 'all' 或分類 ID
  const [selectedAdminGroup, setSelectedAdminGroup] = useState('all'); // 'all' 或管理組織 ID
  const [adminGroups, setAdminGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileDetail, setShowFileDetail] = useState(false);
  const [showEditPermissions, setShowEditPermissions] = useState(false);
  const [editingFilePermissions, setEditingFilePermissions] = useState([]);
  const [showEditCategory, setShowEditCategory] = useState(false);
  const [editingFileCategory, setEditingFileCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const itemsPerPage = 20;

  // 對話框動畫
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));
  const detailModal = useModalAnimation(showFileDetail, () => setShowFileDetail(false));
  const permissionsModal = useModalAnimation(showEditPermissions, () => {
    setShowEditPermissions(false);
  });
  const categoryModal = useModalAnimation(showEditCategory, () => setShowEditCategory(false));

  // 當權限 modal 完全關閉後重置狀態
  useEffect(() => {
    if (!showEditPermissions && !permissionsModal.shouldRender) {
      setEditingFilePermissions([]);
      setSelectedFile(null);
    }
  }, [showEditPermissions, permissionsModal.shouldRender]);

  useEffect(() => {
    if (!showEditCategory && !categoryModal.shouldRender) {
      setEditingFileCategory('');
      setSelectedFile(null);
    }
  }, [showEditCategory, categoryModal.shouldRender]);
  
  // 獲取當前使用者權限
  const getUserInfo = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : { name: '管理員', username: 'Admin', role: 'ADMIN' };
    } catch {
      return { name: '管理員', username: 'Admin', role: 'ADMIN' };
    }
  };

  // 處理編輯檔案分類
  const handleEditCategory = (file) => {
    setSelectedFile(file);
    setEditingFileCategory(file.categoryId ? String(file.categoryId) : '');
    setShowEditCategory(true);
  };

  const handleSaveCategory = async () => {
    if (!selectedFile) return;

    try {
      const response = await updateFile(selectedFile.id, {
        category_id: editingFileCategory ? parseInt(editingFileCategory, 10) : null
      });

      if (response.success) {
        toast.success('檔案分類已更新');
        categoryModal.handleClose();
        setEditingFileCategory('');
        setSelectedFile(null);
        await Promise.all([loadFiles(), loadCategories()]);
      } else {
        toast.error(response.message || '更新分類失敗');
      }
    } catch (error) {
      console.error('更新分類錯誤:', error);
      toast.error('更新分類失敗');
    }
  };
  
  const user = getUserInfo();

  // 若從外部帶入搜尋詞（例如從上傳頁跳轉），套用後通知已消耗
  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      setCurrentPage(1);
      onSearchConsumed?.();
    }
  }, [initialSearch]);

  // 載入檔案列表和分類
  useEffect(() => {
    loadFiles();
    loadCategories();
    loadUserGroups();
  }, [searchTerm, currentPage, selectedCategory, selectedAdminGroup]);

  // 載入管理組織列表
  useEffect(() => {
    loadAdminGroups();
  }, []);

  // 載入檔案列表
  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const categoryId = selectedCategory === 'all' ? null : selectedCategory;
      const params = {
        search: searchTerm,
        category: categoryId,
        page: currentPage,
        limit: itemsPerPage
      };
      if (selectedAdminGroup !== 'all') {
        params.admin_group_id = parseInt(selectedAdminGroup);
      }
      const response = await getFiles(params);
      
      if (response.success) {
        setFiles(response.data.files);
        setTotalPages(response.data.pages || 1);
        setTotalFiles(response.data.total || 0);
      } else {
        console.error('載入檔案失敗:', response.message);
      }
    } catch (error) {
      console.error('載入檔案錯誤:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 載入分類列表
  const loadCategories = async () => {
    try {
      const response = await getCategoriesWithDetails();
      
      if (response.success) {
        setCategories(response.data);
        // 建立分類名稱到顏色的對應表
        const map = {};
        response.data.forEach(cat => {
          map[cat.name] = cat.color;
        });
        setCategoryMap(map);
      }
    } catch (error) {
      console.error('載入分類錯誤:', error);
    }
  };

  // 載入身分組列表
  const loadUserGroups = async () => {
    try {
      // 調試：檢查localStorage中的用戶信息
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      console.log('[KnowledgeBase] Loading user groups...');
      console.log('[KnowledgeBase] Current user:', user);
      console.log('[KnowledgeBase] Department ID:', user?.departmentId);
      
      const response = await getUserGroups();
      console.log('[KnowledgeBase] User groups response:', response);
      if (response.success) {
        setUserGroups(response.data || []);
        console.log('[KnowledgeBase] Loaded user groups:', response.data?.length || 0);
      } else {
        console.error('[KnowledgeBase] Failed to load user groups:', response.message);
      }
    } catch (error) {
      console.error('[KnowledgeBase] 載入身分組錯誤:', error);
    }
  };

  // 載入管理組織列表
  const loadAdminGroups = async () => {
    try {
      if (!user.departmentId) return;
      const response = await getAdminGroups(user.departmentId);
      if (response.success) {
        setAdminGroups(response.data || []);
      }
    } catch (error) {
      console.error('載入管理組織錯誤:', error);
    }
  };

  // 處理檢視檔案詳情
  const handleViewDetail = (file) => {
    setSelectedFile(file);
    setShowFileDetail(true);
  };

  // 處理檔案刪除
  const handleDelete = async (id) => {
    try {
      const response = await deleteFile(id);
      
      if (response.success) {
        // 重新載入檔案列表與分類統計（總檔案數來自分類 fileCount）
        await Promise.all([loadFiles(), loadCategories()]);
        deleteModal.handleClose();
        toast.success('檔案刪除成功');
      } else {
        console.error('刪除失敗:', response.message);
        toast.error(response.message);
      }
    } catch (error) {
      console.error('刪除錯誤:', error);
      toast.error('刪除檔案失敗');
    }
  };

  // 處理檔案下載
  const handleDownload = async (id, fileName) => {
    try {
      const response = await downloadFile(id, fileName);
      
      if (response.success) {
        toast.success('檔案下載成功');
      } else {
        console.error('下載失敗:', response.message);
        toast.error(response.message || '下載檔案失敗');
      }
    } catch (error) {
      console.error('下載錯誤:', error);
      toast.error('下載檔案失敗');
    }
  };
  
  // 處理編輯身分組權限
  const handleEditPermissions = async (file) => {
    try {
      console.log('Loading permissions for file:', file.id, file.name);
      // 載入檔案的身分組權限
      const response = await getFileUserGroupPermissions(file.id);
      console.log('Permissions response:', response);
      
      if (response.success) {
        // 確保 response.data 是陣列
        const permissions = Array.isArray(response.data) ? response.data : [];
        console.log('Permissions data:', permissions);
        
        // 提取 userGroupId（注意：API 返回 camelCase）
        const groupIds = permissions
          .map(p => p.userGroupId || p.user_group_id)
          .filter(id => id !== undefined && id !== null);
        console.log('Setting editing permissions to:', groupIds);
        
        setEditingFilePermissions(groupIds);
        setSelectedFile(file);
        setShowEditPermissions(true);
      } else {
        console.error('Failed to load permissions:', response.message);
        toast.error(response.message || '載入權限失敗');
      }
    } catch (error) {
      console.error('載入權限錯誤:', error);
      toast.error('載入權限失敗');
    }
  };

  // 處理儲存身分組權限
  const handleSavePermissions = async () => {
    try {
      console.log('Saving permissions for file:', selectedFile?.id, 'groups:', editingFilePermissions);
      const response = await setFileUserGroupPermissions(
        selectedFile.id,
        editingFilePermissions
      );
      console.log('Save permissions response:', response);
      
      if (response.success) {
        toast.success('權限設定已更新');
        permissionsModal.handleClose();
        // 重置編輯狀態
        setEditingFilePermissions([]);
        setSelectedFile(null);
        await loadFiles();
      } else {
        console.error('Failed to save permissions:', response.message);
        toast.error(response.message || '更新權限失敗');
      }
    } catch (error) {
      console.error('更新權限錯誤:', error);
      toast.error('更新權限失敗');
    }
  };

  // 根據顏色返回對應的 Tailwind 類別（標籤背景）
  const getCategoryColorClasses = (categoryName) => {
    const color = categoryMap[categoryName] || '#6B7280';
    
    // 如果是 hex 顏色碼，返回空字串（將使用 inline style）
    if (color && color.startsWith('#')) {
      return '';
    }
    
    const colorClassMap = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      red: 'bg-red-100 text-red-800',
      purple: 'bg-purple-100 text-purple-800',
      pink: 'bg-pink-100 text-pink-800',
      indigo: 'bg-indigo-100 text-indigo-800',
      orange: 'bg-orange-100 text-orange-800',
      gray: 'bg-gray-100 text-gray-800',
    };
    return colorClassMap[color] || 'bg-gray-100 text-gray-800';
  };

  // 將 hex 顏色轉換為 rgba（帶透明度）
  const hexToRgba = (hex, alpha = 0.2) => {
    if (!hex || !hex.startsWith('#')) return null;
    
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // 根據檔案類型返回圖示
  const getFileIcon = (fileName) => {
    // 防止 fileName 為 undefined 或 null
    if (!fileName || typeof fileName !== 'string') {
      return (
        <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (ext === 'pdf') {
      return (
        <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'doc' || ext === 'docx') {
      return (
        <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'xls' || ext === 'xlsx') {
      return (
        <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'ppt' || ext === 'pptx') {
      return (
        <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    if (ext === 'txt') {
      return (
        <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    );
  };

  // 分類統計從 categories 的 fileCount 取得（後端提供）
  const getCategoryCount = (categoryName) => {
    const category = categories.find(c => c.name === categoryName);
    return category?.fileCount ?? category?.file_count ?? 0;
  };

  // 真實總檔案數（所有分類加總，不受搜尋/篩選影響）
  const realTotalFiles = categories.reduce((sum, c) => sum + (c.fileCount ?? c.file_count ?? 0), 0);

  // 換頁時重置到第一頁
  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
  };

  const handleAdminGroupChange = (groupId) => {
    setSelectedAdminGroup(groupId);
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // 檢查當前使用者是否可操作此檔案
  const canOperateFile = (file) => {
    if (user.role === 'SUPER_ADMIN') return true;
    if (!user.adminGroupId) return !file.adminGroupId;
    return file.adminGroupId === user.adminGroupId;
  };

  const statCards = [
    {
      id: 'all',
      name: '總檔案數',
      count: realTotalFiles,
      color: 'var(--ncku-red)'
    },
    ...categories.map(category => ({
      id: category.id,
      name: category.name,
      count: getCategoryCount(category.name),
      color: category.color || '#6B7280'
    }))
  ];

  return (
    <div className="w-full min-w-0">
      {/* 頁面標題 */}
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2" style={{ color: 'var(--ncku-red)' }}>
          知識庫管理
        </h2>
        <p className="text-sm sm:text-base text-gray-600">管理人事室 AI 客服的知識庫檔案</p>
      </div>

      {/* 統計卡片：固定顯示約 8 張卡片高度，超過可垂直捲動 */}
      <div className="max-h-[27rem] sm:max-h-[13.5rem] overflow-y-auto pr-1 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {statCards.map(card => (
            <div
              key={card.id}
              className="bg-white rounded-lg shadow-md p-3 sm:p-4 lg:p-5 border-l-4 flex flex-col justify-between"
              style={{ borderColor: card.color }}
            >
              <p className="text-gray-600 text-xs sm:text-sm truncate" title={card.name}>{card.name}</p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-bold mt-1 sm:mt-2">
                {card.count}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 操作欄 */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-5 lg:p-6 mb-6 space-y-4">
        {/* 第一排：搜尋框 + 組織篩選 */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 搜尋框 */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="搜尋檔案..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="block w-full pl-10 pr-3 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none text-sm sm:text-base"
            />
          </div>

          {/* 管理組織篩選 */}
          <div className="relative sm:w-44">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <select
              value={selectedAdminGroup}
              onChange={(e) => handleAdminGroupChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 sm:py-3 border border-gray-300 rounded-lg text-sm sm:text-base focus:ring-2 focus:outline-none appearance-none bg-white cursor-pointer"
            >
              <option value="all">全部組織</option>
              <option value="-1">未分配組織</option>
              {adminGroups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* 第二排：分類篩選 pills，超過約 8 個時可在小視窗內垂直捲動 */}
        <div className="max-h-24 overflow-y-auto pr-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleCategoryChange('all')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'text-white shadow-sm'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={selectedCategory === 'all' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              全部
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  selectedCategory === category.id
                    ? 'text-white shadow-sm'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                style={
                  selectedCategory === category.id
                    ? { backgroundColor: category.color || 'var(--ncku-red)' }
                    : {}
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 檔案列表 */}
      <div className="bg-white rounded-xl shadow-md overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
                   style={{ color: 'var(--ncku-red)' }}>
              </div>
              <p className="mt-4 text-gray-600">載入中...</p>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead style={{ backgroundColor: 'var(--ncku-red)' }}>
              <tr>
                <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  檔案名稱
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  類別
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  組織
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  大小
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  上傳日期
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {files.length > 0 ? (
                files.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 sm:px-4 py-3 sm:py-4 max-w-xs">
                    <div className="flex items-center min-w-0">
                      {/* 檔案類型圖示 */}
                      <div className="flex-shrink-0">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="ml-3 min-w-0">
                        <div className="text-xs sm:text-sm font-medium text-gray-900 truncate" title={file.name}>{file.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                    <span 
                      className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getCategoryColorClasses(file.category)}`}
                      style={
                        categoryMap[file.category] && categoryMap[file.category].startsWith('#')
                          ? {
                              backgroundColor: hexToRgba(categoryMap[file.category], 0.15),
                              color: categoryMap[file.category],
                              border: `2px solid ${categoryMap[file.category]}`
                            }
                          : {}
                      }
                    >
                      {file.category}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                    {file.adminGroup ? (
                      <span
                        className="px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full"
                        style={{
                          backgroundColor: hexToRgba(file.adminGroup.color, 0.15) || '#f3f4f6',
                          color: file.adminGroup.color || '#6b7280',
                          border: `1px solid ${file.adminGroup.color || '#d1d5db'}`
                        }}
                      >
                        {file.adminGroup.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                    {file.size}
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                    {file.uploadDate}
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => canOperateFile(file) && handleEditCategory(file)}
                        className={`transition-colors ${canOperateFile(file) ? 'text-amber-600 hover:text-amber-900 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
                        title={canOperateFile(file) ? '變更分類' : '您無權操作此檔案'}
                        disabled={!canOperateFile(file)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => canOperateFile(file) && handleEditPermissions(file)}
                        className={`transition-colors ${canOperateFile(file) ? 'text-purple-600 hover:text-purple-900 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
                        title={canOperateFile(file) ? '設定身分組權限' : '您無權操作此檔案'}
                        disabled={!canOperateFile(file)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </button>
                      <button 
                        className="text-blue-600 hover:text-blue-900 transition-colors cursor-pointer" 
                        onClick={() => handleViewDetail(file)}
                        title="查看詳情"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button 
                        className={`transition-colors ${canOperateFile(file) ? 'text-green-600 hover:text-green-900 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
                        onClick={() => canOperateFile(file) && handleDownload(file.id, file.name)}
                        title={canOperateFile(file) ? '下載檔案' : '您無權操作此檔案'}
                        disabled={!canOperateFile(file)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => canOperateFile(file) && setShowDeleteConfirm(file.id)}
                        className={`transition-opacity ${canOperateFile(file) ? 'hover:opacity-70 cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
                        style={{ color: canOperateFile(file) ? 'var(--ncku-red)' : '#d1d5db' }}
                        title={canOperateFile(file) ? '刪除檔案' : '您無權操作此檔案'}
                        disabled={!canOperateFile(file)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p>{selectedCategory === 'all' ? '目前沒有檔案' : '此分類中沒有檔案'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 分頁元件 */}
      {!isLoading && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            顯示第 <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> 至{' '}
            <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalFiles)}</span> 筆，
            共 <span className="font-medium">{totalFiles}</span> 筆
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className={`px-3 py-2 rounded-lg border ${
                currentPage === 1
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              第一頁
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-2 rounded-lg border ${
                currentPage === 1
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              上一頁
            </button>
            <div className="flex items-center px-4 py-2 text-sm text-gray-700">
              第 <span className="font-medium mx-1">{currentPage}</span> / <span className="font-medium mx-1">{totalPages}</span> 頁
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`px-3 py-2 rounded-lg border ${
                currentPage === totalPages
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              下一頁
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className={`px-3 py-2 rounded-lg border ${
                currentPage === totalPages
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              最後頁
            </button>
          </div>
        </div>
      )}

      {/* 檔案詳情模態框 */}
      {detailModal.shouldRender && selectedFile && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${detailModal.animationClass}`}>
          <div className={`bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto ${detailModal.contentAnimationClass}`}>
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">檔案詳情</h3>
              <button
                onClick={detailModal.handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {getFileIcon(selectedFile.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-semibold text-gray-900 truncate">{selectedFile.name}</h4>
                  <p className="text-sm text-gray-500">檔案大小: {selectedFile.size}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="text-sm font-medium text-gray-500">分類</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedFile.category}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">上傳日期</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedFile.uploadDate}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">管理組織</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedFile.adminGroup ? (
                      <span
                        className="px-2 py-0.5 text-xs rounded-full"
                        style={{
                          backgroundColor: hexToRgba(selectedFile.adminGroup.color, 0.15) || '#f3f4f6',
                          color: selectedFile.adminGroup.color || '#6b7280',
                          border: `1px solid ${selectedFile.adminGroup.color || '#d1d5db'}`
                        }}
                      >
                        {selectedFile.adminGroup.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </p>
                </div>
                {selectedFile.uploader && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">上傳者</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedFile.uploader}</p>
                  </div>
                )}
                {selectedFile.status && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">狀態</label>
                    <p className="mt-1 text-sm text-gray-900">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        selectedFile.status === 'completed' ? 'bg-green-100 text-green-800' :
                        selectedFile.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        selectedFile.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedFile.status === 'completed' ? '已完成' :
                         selectedFile.status === 'processing' ? '處理中' :
                         selectedFile.status === 'failed' ? '失敗' : '待處理'}
                      </span>
                    </p>
                  </div>
                )}
                {selectedFile.isVectorized !== undefined && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">向量化</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedFile.isVectorized ? '✓ 已完成' : '✗ 未完成'}
                    </p>
                  </div>
                )}
                {selectedFile.vectorCount !== undefined && selectedFile.vectorCount > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">向量數量</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedFile.vectorCount}</p>
                  </div>
                )}
                {selectedFile.downloadCount !== undefined && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">下載次數</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedFile.downloadCount}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => {
                  handleDownload(selectedFile.id, selectedFile.name);
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer font-medium flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>下載檔案</span>
              </button>
              <button
                onClick={detailModal.handleClose}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer font-medium"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認模態框 */}
      {deleteModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${deleteModal.animationClass}`}>
          <div className={`bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 ${deleteModal.contentAnimationClass}`}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto bg-red-50">
              <svg className="w-6 h-6" style={{ color: 'var(--ncku-red)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-center mb-2">確認刪除</h3>
            <p className="text-gray-600 text-center mb-6">
              確定要刪除此檔案嗎？此操作無法復原。
            </p>
            <div className="flex space-x-3">
              <button
                onClick={deleteModal.handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 rounded-lg text-white shadow-lg hover:shadow-xl transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 變更分類模態框 */}
      {categoryModal.shouldRender && selectedFile && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${categoryModal.animationClass}`}>
          <div className={`bg-white rounded-xl p-6 w-full max-w-md ${categoryModal.contentAnimationClass}`}>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--ncku-red)' }}>變更檔案分類</h3>
            <p className="text-sm text-gray-600 mb-4">{selectedFile.name}</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">分類</label>
              <select
                value={editingFileCategory}
                onChange={(e) => setEditingFileCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
              >
                <option value="">未設定分類</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">變更後會立即更新，不需要重新上傳檔案。</p>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => categoryModal.handleClose()}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveCategory}
                className="px-4 py-2 text-white rounded-lg cursor-pointer"
                style={{ backgroundColor: 'var(--ncku-red)' }}
              >
                更新分類
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯身分組權限模態框 */}
      {permissionsModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${permissionsModal.animationClass}`}>
          <div className={`bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto ${permissionsModal.contentAnimationClass}`}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                設定檔案身分組權限
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                檔案：{selectedFile?.name}
              </p>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  可訪問的身分組
                </label>
                <div className="border border-gray-300 rounded-lg p-4 max-h-96 overflow-y-auto bg-gray-50">
                  {userGroups.length > 0 ? (
                    <div className="space-y-2">
                      {userGroups.map(group => (
                        <label
                          key={group.id}
                          className="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={editingFilePermissions.includes(group.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingFilePermissions([...editingFilePermissions, group.id]);
                              } else {
                                setEditingFilePermissions(editingFilePermissions.filter(id => id !== group.id));
                              }
                            }}
                            className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                          />
                          <span className="flex items-center text-sm text-gray-700 flex-1">
                            <span
                              className="inline-block w-4 h-4 rounded-full mr-2"
                              style={{ backgroundColor: group.color }}
                            ></span>
                            <span className="font-medium">{group.name}</span>
                            <span className="text-xs text-gray-500 ml-2">
                              (成員: {group.memberCount || 0})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic text-center py-4">
                      目前沒有可用的身分組
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={permissionsModal.handleClose}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer font-medium"
                >
                  儲存權限
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeBase;
