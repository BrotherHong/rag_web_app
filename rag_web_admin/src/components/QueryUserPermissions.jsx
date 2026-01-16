import { useState, useEffect, Fragment } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { 
  getQueryUserPermissions,
  grantFilePermission,
  batchGrantPermissions,
  revokeFilePermission,
  getAvailableFilesForPermissions,
  getDepartments
} from '../services/api';

function QueryUserPermissions({ userId, userName, onClose }) {
  const modal = useModalAnimation(true, onClose);
  const toast = useToast();
  const [permissions, setPermissions] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(null);
  
  // 授權對話框動畫
  const grantModal = useModalAnimation(showGrantDialog, () => setShowGrantDialog(false));
  
  // 撤銷確認對話框動畫
  const revokeModal = useModalAnimation(showRevokeConfirm !== null, () => setShowRevokeConfirm(null));
  
  // 權限篩選
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  
  // 授權表單
  const [grantForm, setGrantForm] = useState({
    file_ids: [],
    department_id: null
  });
  
  // 分類展開狀態
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  
  useEffect(() => {
    loadPermissions();
    loadDepartments();
  }, [userId]);
  
  useEffect(() => {
    if (showGrantDialog && grantForm.department_id) {
      loadAvailableFiles();
    }
  }, [showGrantDialog, grantForm.department_id]);
  
  // 關閉授權對話框時重置表單
  useEffect(() => {
    if (!showGrantDialog) {
      resetGrantForm();
    }
  }, [showGrantDialog]);
  
  const loadPermissions = async () => {
    setLoading(true);
    try {
      const params = selectedDepartment ? { department_id: selectedDepartment } : {};
      const data = await getQueryUserPermissions(userId, params);
      setPermissions(data.items || []);
    } catch (error) {
      console.error('載入權限失敗:', error);
      toast.error('載入權限失敗');
    } finally {
      setLoading(false);
    }
  };
  
  const loadDepartments = async () => {
    try {
      const result = await getDepartments();
      // getDepartments 返回 { success: true, data: [...] }
      setDepartments(result.success ? result.data : []);
    } catch (error) {
      console.error('載入處室失敗:', error);
      setDepartments([]);
    }
  };
  
  const loadAvailableFiles = async () => {
    if (!grantForm.department_id) return;
    
    try {
      // 使用新的 API 獲取按分類分組的可授權文件
      const data = await getAvailableFilesForPermissions(grantForm.department_id);
      
      // 過濾掉已授權的文件
      const permittedFileIds = new Set(permissions.map(p => p.file_id));
      
      // 過濾每個分類中的文件
      const filteredCategories = data.categories.map(category => ({
        ...category,
        files: category.files.filter(file => !permittedFileIds.has(file.id))
      })).filter(category => category.files.length > 0); // 只保留有文件的分類
      
      setCategoriesData(filteredCategories);
      
      // 默認展開所有分類
      setExpandedCategories(new Set(filteredCategories.map(c => c.category_id)));
    } catch (error) {
      console.error('載入可用文件失敗:', error);
      toast.error('載入可用文件失敗');
      setCategoriesData([]);
    }
  };
  
  const handleGrantPermission = async () => {
    if (!grantForm.department_id || grantForm.file_ids.length === 0) {
      toast.error('請選擇處室和文件');
      return;
    }
    
    setLoading(true);
    try {
      await batchGrantPermissions(userId, {
        file_ids: grantForm.file_ids
      });
      
      toast.success(`已授予 ${grantForm.file_ids.length} 個文件的訪問權限`);
      setShowGrantDialog(false);
      resetGrantForm();
      loadPermissions();
    } catch (error) {
      console.error('授權失敗:', error);
      toast.error(error.message || '授權失敗');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRevokePermission = async (permissionId) => {
    setLoading(true);
    try {
      await revokeFilePermission(userId, permissionId);
      toast.success('權限已撤銷');
      setShowRevokeConfirm(null);
      loadPermissions();
    } catch (error) {
      console.error('撤銷失敗:', error);
      toast.error('撤銷失敗');
    } finally {
      setLoading(false);
    }
  };
  
  const resetGrantForm = () => {
    setGrantForm({
      file_ids: [],
      department_id: null
    });
    setCategoriesData([]);
    setExpandedCategories(new Set());
  };
  
  const toggleFileSelection = (fileId) => {
    setGrantForm(prev => ({
      ...prev,
      file_ids: prev.file_ids.includes(fileId)
        ? prev.file_ids.filter(id => id !== fileId)
        : [...prev.file_ids, fileId]
    }));
  };
  
  const toggleCategorySelection = (categoryId) => {
    const category = categoriesData.find(c => c.category_id === categoryId);
    if (!category) return;
    
    const categoryFileIds = category.files.map(f => f.id);
    const allSelected = categoryFileIds.every(id => grantForm.file_ids.includes(id));
    
    if (allSelected) {
      // 取消選擇該分類的所有文件
      setGrantForm(prev => ({
        ...prev,
        file_ids: prev.file_ids.filter(id => !categoryFileIds.includes(id))
      }));
    } else {
      // 選擇該分類的所有文件
      setGrantForm(prev => ({
        ...prev,
        file_ids: [...new Set([...prev.file_ids, ...categoryFileIds])]
      }));
    }
  };
  
  const selectAllFiles = () => {
    const allFileIds = categoriesData.flatMap(c => c.files.map(f => f.id));
    setGrantForm(prev => ({
      ...prev,
      file_ids: allFileIds
    }));
  };
  
  const deselectAllFiles = () => {
    setGrantForm(prev => ({
      ...prev,
      file_ids: []
    }));
  };
  
  const toggleCategoryExpanded = (categoryId) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };
  
  const isCategorySelected = (categoryId) => {
    const category = categoriesData.find(c => c.category_id === categoryId);
    if (!category) return false;
    
    const categoryFileIds = category.files.map(f => f.id);
    return categoryFileIds.length > 0 && categoryFileIds.every(id => grantForm.file_ids.includes(id));
  };
  
  const isCategoryPartiallySelected = (categoryId) => {
    const category = categoriesData.find(c => c.category_id === categoryId);
    if (!category) return false;
    
    const categoryFileIds = category.files.map(f => f.id);
    const selectedCount = categoryFileIds.filter(id => grantForm.file_ids.includes(id)).length;
    return selectedCount > 0 && selectedCount < categoryFileIds.length;
  };
  
  // 按處室分組權限
  const groupedPermissions = permissions.reduce((acc, permission) => {
    const deptName = permission.department_name || '未知處室';
    if (!acc[deptName]) {
      acc[deptName] = [];
    }
    acc[deptName].push(permission);
    return acc;
  }, {});
  
  return (
    <>
      <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 ${modal.animationClass}`}>
        <div className={`bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto ${modal.contentAnimationClass}`}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">文件權限管理</h3>
            <p className="text-sm text-gray-600 mt-1">管理 {userName} 的文件訪問權限</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setShowGrantDialog(true);
                resetGrantForm();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>授予權限</span>
            </button>
            <button
              onClick={modal.handleClose}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {/* 篩選器 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">篩選處室</label>
            <select
              value={selectedDepartment || ''}
              onChange={(e) => {
                setSelectedDepartment(e.target.value ? parseInt(e.target.value) : null);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">全部處室</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
          
          {/* 權限列表 */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">載入中...</div>
          ) : permissions.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">尚未授予任何文件權限</p>
              <button
                onClick={() => setShowGrantDialog(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              >
                立即授權
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedPermissions).map(([deptName, perms]) => (
                <div key={deptName} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h4 className="font-medium text-gray-900">{deptName}</h4>
                    <p className="text-sm text-gray-600 mt-1">共 {perms.length} 個文件</p>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {perms.map(permission => (
                      <div key={permission.id} className="px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <p className="font-medium text-gray-900">{permission.file_name || '未知文件'}</p>
                                {permission.is_public && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    已公開
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {permission.category_name || '未分類'} · 授予時間: {new Date(permission.granted_at).toLocaleString('zh-TW')}
                              </p>
                              {permission.is_public && (
                                <p className="text-xs text-green-600 mt-1">
                                  💡 此檔案已公開，所有用戶都可訪問（無需授權）
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowRevokeConfirm(permission)}
                          disabled={loading}
                          className="ml-4 px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          撤銷
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
      
      {/* 授權對話框 */}
      {grantModal.shouldRender && (
        <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] ${grantModal.animationClass}`}>
          <div className={`bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto ${grantModal.contentAnimationClass}`}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h4 className="text-lg font-semibold text-gray-900">授予文件權限</h4>
              <button
                onClick={grantModal.handleClose}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 選擇處室 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  選擇處室 <span className="text-red-500">*</span>
                </label>
                <select
                  value={grantForm.department_id || ''}
                  onChange={(e) => {
                    setGrantForm({
                      ...grantForm,
                      department_id: e.target.value ? parseInt(e.target.value) : null,
                      file_ids: []
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">請選擇處室</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              
              {/* 選擇文件（按分類分組） */}
              {grantForm.department_id && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      選擇文件（未公開） <span className="text-red-500">*</span>
                    </label>
                    <div className="flex space-x-2">
                      <button
                        onClick={selectAllFiles}
                        className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        全選
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        onClick={deselectAllFiles}
                        className="text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
                      >
                        取消全選
                      </button>
                    </div>
                  </div>
                  
                  {categoriesData.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                      該處室沒有可授權的文件（所有未公開文件已授權或無未公開文件）
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                      {categoriesData.map((category, index) => {
                        const isExpanded = expandedCategories.has(category.category_id);
                        const isSelected = isCategorySelected(category.category_id);
                        const isPartiallySelected = isCategoryPartiallySelected(category.category_id);
                        
                        return (
                          <div key={category.category_id} className={index < categoriesData.length - 1 ? 'border-b border-gray-200' : ''}>
                            {/* 分類標題行 */}
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors">
                              <div className="flex items-center flex-1">
                                <button
                                  onClick={() => toggleCategoryExpanded(category.category_id)}
                                  className="mr-2 text-gray-500 hover:text-gray-700 cursor-pointer"
                                >
                                  <svg 
                                    className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                                <label className="flex items-center flex-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    ref={el => {
                                      if (el) el.indeterminate = isPartiallySelected;
                                    }}
                                    onChange={() => toggleCategorySelection(category.category_id)}
                                    className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                  <div>
                                    <span className="font-medium text-gray-900">{category.category_name}</span>
                                    <span className="ml-2 text-sm text-gray-500">({category.files.length} 個文件)</span>
                                  </div>
                                </label>
                              </div>
                            </div>
                            
                            {/* 分類文件列表 */}
                            {isExpanded && (
                              <div className="bg-white">
                                {category.files.map((file, fileIndex) => (
                                  <label
                                    key={file.id}
                                    className={`flex items-center px-4 py-3 pl-12 hover:bg-gray-50 cursor-pointer ${fileIndex < category.files.length - 1 ? 'border-b border-gray-100' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={grantForm.file_ids.includes(file.id)}
                                      onChange={() => toggleFileSelection(file.id)}
                                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-900">{file.filename}</p>
                                      <p className="text-sm text-gray-500">
                                        {(file.file_size / 1024 / 1024).toFixed(2)} MB
                                        {file.created_at && ` · ${new Date(file.created_at).toLocaleDateString('zh-TW')}`}
                                      </p>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {grantForm.file_ids.length > 0 && (
                    <p className="text-sm text-gray-600 mt-2">
                      已選擇 {grantForm.file_ids.length} 個文件
                    </p>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3 sticky bottom-0 bg-white">
              <button
                onClick={grantModal.handleClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleGrantPermission}
                disabled={loading || !grantForm.department_id || grantForm.file_ids.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? '處理中...' : `授予權限 (${grantForm.file_ids.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 撤銷確認 Modal */}
      {revokeModal.shouldRender && showRevokeConfirm && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[70] ${revokeModal.animationClass}`}>
          <div className={`bg-white rounded-lg shadow-xl max-w-md w-full ${revokeModal.contentAnimationClass}`}>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">確認撤銷權限</h3>
              <p className="text-gray-600 mb-6">
                確定要撤銷「{showRevokeConfirm.file_name}」的訪問權限嗎？
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={revokeModal.handleClose}
                  disabled={loading}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => handleRevokePermission(showRevokeConfirm.id)}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? '處理中...' : '撤銷'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default QueryUserPermissions;
