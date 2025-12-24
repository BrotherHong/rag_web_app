/**
 * Activity Log Component
 * 活動記錄組件 - 顯示系統操作記錄和處室篩選
 */

import { getActivityConfig } from '../../utils/activityConfig.js';

function ActivityLog({ 
  activities, 
  departments, 
  selectedDepartment, 
  onDepartmentChange 
}) {
  // 獲取處室顏色樣式
  const getDepartmentStyle = (color) => {
    // 直接使用 hex 顏色
    if (color && color.startsWith('#')) {
      // 將 hex 轉換為淺色背景和深色文字
      const bg = color + '20'; // 添加透明度
      const text = color;
      return { bg, text };
    }
    return { bg: '#f3f4f6', text: '#374151' };
  };

  // 從 description 中提取操作目標
  const extractTarget = (description) => {
    // description 格式通常是 "操作類型: 目標名稱"
    const colonIndex = description.indexOf(':');
    if (colonIndex > -1) {
      return description.substring(colonIndex + 1).trim();
    }
    return description;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--ncku-red)' }}>
            活動記錄
          </h2>
          <p className="text-gray-600 mt-2">查看所有處室的系統操作記錄</p>
        </div>
        
        {/* 處室篩選 */}
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-700">篩選處室:</label>
          <select
            value={selectedDepartment}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          >
            <option value="all">所有處室</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 活動列表 */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {activities.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {activities.map((activity) => {
              const dept = departments.find(d => d.id === activity.departmentId);
              const config = getActivityConfig(activity.type);
              const deptStyle = dept ? getDepartmentStyle(dept.color) : null;

              return (
                <div key={activity.id} className="p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    {/* 活動類型圖示 */}
                    <div className="flex-shrink-0">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: config.bgColor }}
                      >
                        <svg 
                          className="w-6 h-6" 
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
                    </div>

                    {/* 活動詳情 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-lg">
                          {config.label}
                        </span>
                        {/* 顯示處室標籤 */}
                        {activity.departmentName && (
                          <span 
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={dept && deptStyle ? { 
                              backgroundColor: deptStyle.bg,
                              color: deptStyle.text
                            } : {
                              backgroundColor: '#EEF2FF',
                              color: '#4F46E5'
                            }}
                          >
                            {activity.departmentName}
                          </span>
                        )}
                      </div>
                      
                      {/* 操作目標 */}
                      <p className="text-base text-gray-700 mb-2 font-medium">
                        {extractTarget(activity.description)}
                      </p>
                      
                      {/* 操作者資訊 */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center font-medium">
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {activity.user}
                        </span>
                        <span className="flex items-center text-gray-500">
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(activity.timestamp).toLocaleString('zh-TW', { 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <svg className="w-20 h-20 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-lg">尚無活動記錄</p>
            <p className="text-gray-400 text-sm mt-2">系統操作記錄將顯示在這裡</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityLog;
