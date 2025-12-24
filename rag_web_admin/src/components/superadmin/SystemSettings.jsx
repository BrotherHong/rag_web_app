/**
 * System Settings Component
 * 系統設定組件 - 管理 AI 模型、RAG、備份和系統資訊
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';

function SystemSettings({ 
  systemSettings, 
  systemInfo, 
  onSettingsUpdate, 
  onSettingsSave, 
  onSettingsCancel 
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('ai-model');
  const [tempSettings, setTempSettings] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // 初始化暫存設定
  useEffect(() => {
    if (systemSettings) {
      // 每次 systemSettings 變更時都更新 tempSettings
      setTempSettings(systemSettings);
      setHasUnsavedChanges(false);
    }
  }, [systemSettings]);

  // 處理設定變更
  const handleChange = (key, value) => {
    setTempSettings({ ...tempSettings, [key]: value });
    setHasUnsavedChanges(true);
    if (onSettingsUpdate) {
      onSettingsUpdate(key, value);
    }
  };

  // 儲存設定
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSettingsSave(tempSettings);
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date());
    } catch (error) {
      console.error('儲存設定錯誤:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 取消變更
  const handleCancel = () => {
    // 重置為原始的 systemSettings
    setTempSettings({ ...systemSettings });
    setHasUnsavedChanges(false);
    if (onSettingsCancel) {
      onSettingsCancel();
    }
  };

  if (!tempSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent"
               style={{ color: 'var(--ncku-red)' }}>
          </div>
          <p className="mt-4 text-gray-600">載入設定中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--ncku-red)' }}>
          系統設定
        </h2>
        <p className="text-gray-600">管理系統全域設定</p>
      </div>

      {/* 設定子頁籤 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ai-model')}
            className={`px-6 py-3 font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'ai-model'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            style={activeTab === 'ai-model' ? { backgroundColor: 'var(--ncku-red)' } : {}}
          >
            AI 模型設定
          </button>
          <button
            onClick={() => setActiveTab('rag')}
            className={`px-6 py-3 font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'rag'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            style={activeTab === 'rag' ? { backgroundColor: 'var(--ncku-red)' } : {}}
          >
            RAG 設定
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-6 py-3 font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'backup'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            style={activeTab === 'backup' ? { backgroundColor: 'var(--ncku-red)' } : {}}
          >
            備份設定
          </button>
          <button
            onClick={() => setActiveTab('system-info')}
            className={`px-6 py-3 font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'system-info'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            style={activeTab === 'system-info' ? { backgroundColor: 'var(--ncku-red)' } : {}}
          >
            系統資訊
          </button>
        </div>

        <div className="p-6">
          {/* 儲存/取消按鈕區 - 只在非系統資訊頁面顯示 */}
          {activeTab !== 'system-info' && (
            <div className="flex justify-end items-center space-x-3 mb-6 pb-6 border-b border-gray-200">
              <button
                onClick={handleCancel}
                disabled={!hasUnsavedChanges || isSaving}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消變更
              </button>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || isSaving}
                className="px-6 py-2 text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                style={{ backgroundColor: hasUnsavedChanges ? 'var(--ncku-red)' : '#9ca3af' }}
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-solid border-white border-r-transparent"></div>
                    <span>儲存中...</span>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>儲存設定</span>
                  </>
                ) : lastSavedTime ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>已儲存</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>儲存設定</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* AI 模型設定 */}
          {activeTab === 'ai-model' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AI 模型</label>
                {systemSettings?.rag?.available_models?.length > 0 ? (
                  <select
                    value={tempSettings.rag?.model_name}
                    onChange={(e) => handleChange('rag', { ...tempSettings.rag, model_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  >
                    {systemSettings.rag.available_models.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-4 py-2 border border-red-300 rounded-lg bg-red-50 text-red-600">
                    ⚠️ 無法載入 AI 模型選項，請檢查後端設定
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Temperature: {tempSettings.rag?.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tempSettings.rag?.temperature || 0.7}
                  onChange={(e) => handleChange('rag', { ...tempSettings.rag, temperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>精確</span>
                  <span>創意</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Tokens: {tempSettings.rag?.max_tokens}
                </label>
                <input
                  type="range"
                  min="100"
                  max="4000"
                  step="100"
                  value={tempSettings.rag?.max_tokens || 2000}
                  onChange={(e) => handleChange('rag', { ...tempSettings.rag, max_tokens: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>100</span>
                  <span>4000</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Top P: {tempSettings.rag?.top_p}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tempSettings.rag?.top_p || 1.0}
                  onChange={(e) => handleChange('rag', { ...tempSettings.rag, top_p: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">回應風格</label>
                {systemSettings?.rag?.available_tones?.length > 0 ? (
                  <select
                    value={tempSettings.rag?.tone}
                    onChange={(e) => handleChange('rag', { ...tempSettings.rag, tone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  >
                    {systemSettings.rag.available_tones.map((tone) => (
                      <option key={tone.value} value={tone.value}>
                        {tone.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-4 py-2 border border-red-300 rounded-lg bg-red-50 text-red-600">
                    ⚠️ 無法載入回應風格選項，請檢查後端設定
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RAG 設定 */}
          {activeTab === 'rag' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  相似度閾值: {tempSettings.rag?.similarity_threshold}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={tempSettings.rag?.similarity_threshold || 0.7}
                  onChange={(e) => handleChange('rag', { ...tempSettings.rag, similarity_threshold: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">設定文檔檢索的最低相似度要求</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  最大檢索文檔數: {tempSettings.rag?.top_k}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={tempSettings.rag?.top_k || 5}
                  onChange={(e) => handleChange('rag', { ...tempSettings.rag, top_k: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  自動清理天數: {tempSettings.rag?.auto_cleanup_days || 90} 天
                </label>
                <input
                  type="range"
                  min="30"
                  max="365"
                  step="30"
                  value={tempSettings.rag?.auto_cleanup_days || 90}
                  onChange={(e) => handleChange('rag', { ...tempSettings.rag, auto_cleanup_days: parseInt(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">自動清理超過指定天數未使用的文檔</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">索引更新頻率</label>
                {systemSettings?.rag?.available_index_frequencies?.length > 0 ? (
                  <select
                    value={tempSettings.rag?.index_update_frequency}
                    onChange={(e) => handleChange('rag', { ...tempSettings.rag, index_update_frequency: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                  >
                    {systemSettings.rag.available_index_frequencies.map((freq) => (
                      <option key={freq.value} value={freq.value}>
                        {freq.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-4 py-2 border border-red-300 rounded-lg bg-red-50 text-red-600">
                    ⚠️ 無法載入索引更新頻率選項，請檢查後端設定
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 備份設定 */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">自動備份</p>
                  <p className="text-sm text-gray-600">定期自動備份系統資料</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempSettings.backup?.auto_backup || false}
                    onChange={(e) => handleChange('backup', { ...tempSettings.backup, auto_backup: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>

              {tempSettings.backup?.auto_backup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">備份頻率</label>
                  {systemSettings?.backup?.available_backup_frequencies?.length > 0 ? (
                    <select
                      value={tempSettings.backup?.backup_frequency}
                      onChange={(e) => handleChange('backup', { ...tempSettings.backup, backup_frequency: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                    >
                      {systemSettings.backup.available_backup_frequencies.map((freq) => (
                        <option key={freq.value} value={freq.value}>
                          {freq.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full px-4 py-2 border border-red-300 rounded-lg bg-red-50 text-red-600">
                      ⚠️ 無法載入備份頻率選項，請檢查後端設定
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-gray-900">備份歷史</h4>
                  <button
                    onClick={() => toast.info('立即備份功能開發中')}
                    className="px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                    style={{ backgroundColor: 'var(--ncku-red)' }}
                  >
                    立即備份
                  </button>
                </div>
                <div className="space-y-2">
                  {[
                    { date: '2024-01-15 02:00', size: '125 MB', status: 'success' },
                    { date: '2024-01-14 02:00', size: '124 MB', status: 'success' },
                    { date: '2024-01-13 02:00', size: '123 MB', status: 'success' },
                  ].map((backup, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{backup.date}</p>
                          <p className="text-xs text-gray-500">{backup.size}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toast.info('還原備份功能開發中')}
                        className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        還原
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 系統資訊 */}
          {activeTab === 'system-info' && systemInfo && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">系統版本</p>
                  <p className="text-xl font-bold text-gray-900">{systemInfo.version}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">平台資訊</p>
                  <p className="text-lg font-bold text-gray-900">{systemInfo.platform}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">資料庫大小</p>
                  <p className="text-xl font-bold text-gray-900">{systemInfo.databaseSize}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">檔案總數</p>
                  <p className="text-xl font-bold text-gray-900">
                    {systemInfo.totalFiles?.toLocaleString() || '0'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">使用者總數</p>
                  <p className="text-xl font-bold text-gray-900">
                    {systemInfo.totalUsers?.toLocaleString() || '0'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">活動記錄數</p>
                  <p className="text-xl font-bold text-gray-900">
                    {systemInfo.totalActivities?.toLocaleString() || '0'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">儲存空間使用</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">磁碟空間</span>
                      <span className="font-medium text-gray-900">
                        {systemInfo.storage?.used || '0 GB'} / {systemInfo.storage?.total || '100 GB'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.min(systemInfo.storage?.percentage || 0, 100)}%`,
                          backgroundColor: (systemInfo.storage?.percentage || 0) > 80 ? '#ef4444' : 'var(--ncku-red)'
                        }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {(systemInfo.storage?.percentage || 0).toFixed(1)}% 使用中
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SystemSettings;
