/**
 * Department Stats Modal Component
 * 處室統計彈窗組件 - 顯示處室的詳細統計資料
 */

import { useModalAnimation } from '../../hooks/useModalAnimation';
import { useToast } from '../../contexts/ToastContext';
import { getActivityConfig } from '../../utils/activityConfig';

function DepartmentStatsModal({ department, statsData, onClose, isOpen = true }) {
  const modal = useModalAnimation(isOpen, onClose);
  const toast = useToast();

  if (!modal.shouldRender) return null;

  // 複製網址（支援 HTTP 環境）
  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/query/${department.slug}`;
    
    try {
      await navigator.clipboard.writeText(url);
      toast.success('已複製查詢網址');
    } catch {
      // 備用方案：相容 HTTP 環境
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        toast.success('已複製查詢網址');
      } catch {
        toast.error('複製失敗，請手動複製');
      }
      document.body.removeChild(textarea);
    }
  };

  const extractTarget = (description) => {
    const colonIndex = description?.indexOf(':');
    if (colonIndex > -1) {
      return description.substring(colonIndex + 1).trim();
    }
    return description || '系統操作';
  };

  return (
    <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 ${modal.animationClass}`}>
      <div className={`bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto ${modal.contentAnimationClass}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold" style={{ color: 'var(--ncku-red)' }}>
            {department.name} - 統計資料
          </h3>
          <button
            onClick={modal.handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-6">
          {/* 查詢地址資訊 */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 mb-2">查詢系統網址</p>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="flex items-center justify-between space-x-2">
                    <code className="text-sm font-mono text-blue-800 break-all">
                      {window.location.origin}/query/{department.slug}
                    </code>
                    <button
                      onClick={handleCopyUrl}
                      className="flex-shrink-0 p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      title="複製完整網址"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  URL 識別碼：<span className="font-mono font-semibold">{department.slug}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 總覽 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">總檔案數</p>
              <p className="text-3xl font-bold text-blue-600">{statsData.totalFiles}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">使用者數</p>
              <p className="text-3xl font-bold text-green-600">{statsData.totalUsers}</p>
            </div>
          </div>

          {/* 分類統計 */}
          <div>
            <h4 className="font-semibold mb-3 text-gray-900">檔案分類統計</h4>
            {statsData.filesByCategory && Object.keys(statsData.filesByCategory).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(statsData.filesByCategory).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-700">{category}</span>
                    <span className="font-semibold text-gray-900">{count} 個檔案</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">暫無分類資料</p>
            )}
          </div>

          {/* 最近活動 */}
          <div>
            <h4 className="font-semibold mb-3 text-gray-900">最近活動</h4>
            {statsData.recentActivities && statsData.recentActivities.length > 0 ? (
              <div className="space-y-2">
                {statsData.recentActivities.map((activity, index) => {
                  const config = getActivityConfig(activity.type?.toLowerCase() || activity.type);

                  return (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: config.bgColor }}
                      >
                        <svg 
                          className="w-4 h-4" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                          style={{ color: config.iconColor }}
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d={config.icon}
                          />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 mb-0.5">
                          {config.label}
                        </p>
                        <p className="text-sm text-gray-700 mb-1">
                          {extractTarget(activity.description)}
                        </p>
                        <p className="text-xs text-gray-500">
                          <span className="inline-flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {activity.user}
                          </span>
                          <span className="mx-2">•</span>
                          <span>{new Date(activity.createdAt).toLocaleString('zh-TW')}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">暫無活動記錄</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DepartmentStatsModal;
