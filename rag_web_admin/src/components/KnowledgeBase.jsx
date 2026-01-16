import { useState, useEffect } from 'react';
import { getFiles, deleteFile, downloadFile, updateFile, getCategoriesWithDetails } from '../services/api';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useToast } from '../contexts/ToastContext';

function KnowledgeBase() {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryMap, setCategoryMap] = useState({}); // 用於儲存分類名稱到顏色的對應
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all'); // 使用 'all' 或分類 ID
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileDetail, setShowFileDetail] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const itemsPerPage = 20;

  // 對話框動畫
  const deleteModal = useModalAnimation(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));
  const detailModal = useModalAnimation(showFileDetail, () => setShowFileDetail(false));
  
  // 獲取當前使用者權限
  const getUserInfo = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : { name: '管理員', username: 'Admin', role: 'ADMIN' };
    } catch {
      return { name: '管理員', username: 'Admin', role: 'ADMIN' };
    }
  };
  
  const user = getUserInfo();

  // 載入檔案列表和分類
  useEffect(() => {
    loadFiles();
    loadCategories();
  }, [searchTerm, currentPage, selectedCategory]);

  // 載入檔案列表
  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const categoryId = selectedCategory === 'all' ? null : selectedCategory;
      const response = await getFiles({
        search: searchTerm,
        category: categoryId,
        page: currentPage,
        limit: itemsPerPage
      });
      
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
        // 重新載入檔案列表
        await loadFiles();
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
  
  // 處理切換文件公開狀態
  const handleTogglePublic = async (file) => {
    try {
      const newPublicStatus = !file.is_public;
      const response = await updateFile(file.id, {
        is_public: newPublicStatus
      });
      
      if (response.success) {
        toast.success(newPublicStatus ? '文件已設為公開' : '文件已設為私有');
        // 重新載入檔案列表
        await loadFiles();
      } else {
        toast.error(response.message || '更新失敗');
      }
    } catch (error) {
      console.error('更新錯誤:', error);
      toast.error('更新文件狀態失敗');
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
    return category?.fileCount || 0;
  };

  // 換頁時重置到第一頁
  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  return (
    <div>
      {/* 頁面標題 */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--ncku-red)' }}>
          知識庫管理
        </h2>
        <p className="text-gray-600">管理人事室 AI 客服的知識庫檔案</p>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4" 
             style={{ borderColor: 'var(--ncku-red)' }}>
          <p className="text-gray-600 text-sm">總檔案數</p>
          <p className="text-2xl font-bold mt-1">
            {categories.reduce((sum, cat) => sum + (cat.fileCount || 0), 0)}
          </p>
        </div>
        {categories.map(category => (
          <div 
            key={category.id} 
            className="bg-white rounded-lg shadow-md p-4 border-l-4"
            style={{ borderColor: category.color || '#6B7280' }}
          >
            <p className="text-gray-600 text-sm">{category.name}</p>
            <p className="text-2xl font-bold mt-1">
              {getCategoryCount(category.name)}
            </p>
          </div>
        ))}
      </div>

      {/* 操作欄 */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          {/* 搜尋框 */}
          <div className="flex-1 md:max-w-md">
            <div className="relative">
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
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
              />
            </div>
          </div>

          {/* 分類篩選 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleCategoryChange('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'text-white shadow-md'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
              style={selectedCategory === 'all' ? { backgroundColor: 'var(--ncku-red)' } : {}}
            >
              全部
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                  selectedCategory === category.id
                    ? 'text-white shadow-md'
                    : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
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
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  檔案名稱
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  類別
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  大小
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  公開狀態
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  上傳日期
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {files.length > 0 ? (
                files.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {/* 檔案類型圖示 */}
                      <div className="flex-shrink-0">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{file.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {file.size}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      file.is_public 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {file.is_public ? '公開' : '私有'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {file.uploadDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleTogglePublic(file)}
                        className={`${file.is_public ? 'text-orange-600 hover:text-orange-900' : 'text-gray-400 hover:text-gray-600'} transition-colors cursor-pointer`}
                        title={file.is_public ? '設為私有' : '設為公開'}
                      >
                        {file.is_public ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          </svg>
                        )}
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
                        className="text-green-600 hover:text-green-900 transition-colors cursor-pointer"
                        onClick={() => handleDownload(file.id, file.name)}
                        title="下載檔案"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(file.id)}
                        style={{ color: 'var(--ncku-red)' }}
                        className="hover:opacity-70 transition-opacity cursor-pointer"
                        title="刪除檔案"
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
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
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
    </div>
  );
}

export default KnowledgeBase;
