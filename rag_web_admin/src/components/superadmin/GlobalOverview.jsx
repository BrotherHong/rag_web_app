import { useEffect, useState } from 'react';
import { getSystemInfo, getDepartments, getUsers } from '../../services/api';

function StatCard({ title, value, subtitle, colorClass = 'text-gray-900', bgClass = 'bg-gray-50' }) {
  return (
    <div className={`${bgClass} rounded-lg p-4`}>
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

const formatBytes = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return value;
  if (num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(num) / Math.log(1024)));
  const sized = num / Math.pow(1024, idx);
  return `${sized.toFixed(sized >= 10 ? 0 : 1)} ${units[idx]}`;
};

export default function GlobalOverview() {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [systemInfo, setSystemInfo] = useState(null);
  const [queryStats, setQueryStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [deptRes, userRes, sysRes] = await Promise.all([
          getDepartments(),
          getUsers(),
          getSystemInfo(),
        ]);

        if (deptRes?.success) setDepartments(deptRes.data);
        if (userRes?.success) setUsers(userRes.data);
        if (sysRes?.success) {
          setSystemInfo(sysRes.data);
          // 從 systemInfo 取得查詢統計
          if (sysRes.data.queryStats) {
            setQueryStats(sysRes.data.queryStats);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalFiles = departments.reduce((sum, d) => sum + (d.fileCount || 0), 0);
  const totalUsers = users.length;
  const totalDepartments = departments.length;
  const queriesByDept = queryStats?.queriesByDepartment || [];
  const visitsByDept = queryStats?.visitsByDepartment || [];
  const maxQueryCount = queriesByDept.length > 0 ? Math.max(...queriesByDept.map((d) => d.queryCount || 0)) : 0;
  const maxVisits = visitsByDept.length > 0 ? Math.max(...visitsByDept.map((d) => d.visits || 0)) : 0;
  const avgResponse = queryStats?.averageResponseTime ?? null;
  const responseBarPercent = avgResponse != null ? Math.min(100, (avgResponse / 20) * 100) : 0; // 20s 作為上限

  return (
    <div className="space-y-8">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-solid border-current border-r-transparent" style={{ color: 'var(--ncku-red)' }}></div>
        </div>
      )}

      {/* 總覽統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="總處室數" value={totalDepartments} colorClass="text-blue-600" bgClass="bg-blue-50" />
        <StatCard title="總使用者數" value={totalUsers} colorClass="text-green-600" bgClass="bg-green-50" />
        <StatCard title="總檔案數" value={totalFiles} colorClass="text-indigo-600" bgClass="bg-indigo-50" />
      </div>

      {/* 系統資源 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--ncku-red)' }}>系統資源概況</h3>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await getSystemInfo();
                if (res?.success) setSystemInfo(res.data);
              } finally {
                setLoading(false);
              }
            }}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
          >
            重新整理
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard title="資料庫大小" value={systemInfo?.databaseSize || '-'} />
          <StatCard title="API 請求量" value={systemInfo?.apiRequests ?? '-'} colorClass="text-orange-600" bgClass="bg-orange-50" />
        </div>
        {systemInfo?.updatedAt && (
          <p className="text-xs text-gray-500 mt-2">更新時間：{new Date(systemInfo.updatedAt).toLocaleString('zh-TW')}</p>
        )}
      </div>

      {/* 查詢統計 - 圓餅圖 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>查詢統計</h3>
        {queriesByDept.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 左側：各處室數據列表 */}
            <div className="space-y-3">
              {queriesByDept.map((dept, idx) => {
                const colors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#14b8a6', '#f97316'];
                const color = colors[idx % colors.length];
                return (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: color }}></div>
                      <span className="text-sm text-gray-800">{dept.departmentName}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{dept.queryCount} 次</span>
                  </div>
                );
              })}
            </div>
            
            {/* 右側：圓餅圖 */}
            <div className="flex items-center justify-center">
              {(() => {
                const total = queriesByDept.reduce((sum, d) => sum + (d.queryCount || 0), 0);
                if (total === 0) return <p className="text-gray-500">暫無資料</p>;
                
                const colors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#14b8a6', '#f97316'];
                let cumulativeAngle = 0;
                const radius = 80;
                const cx = 100;
                const cy = 100;
                
                return (
                  <svg width="200" height="200" viewBox="0 0 200 200">
                    {queriesByDept.map((dept, idx) => {
                      const percentage = (dept.queryCount / total) * 100;
                      const angle = (percentage / 100) * 360;
                      const startAngle = cumulativeAngle;
                      const endAngle = cumulativeAngle + angle;
                      
                      const startRad = (startAngle - 90) * (Math.PI / 180);
                      const endRad = (endAngle - 90) * (Math.PI / 180);
                      
                      const x1 = cx + radius * Math.cos(startRad);
                      const y1 = cy + radius * Math.sin(startRad);
                      const x2 = cx + radius * Math.cos(endRad);
                      const y2 = cy + radius * Math.sin(endRad);
                      
                      const largeArc = angle > 180 ? 1 : 0;
                      const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                      
                      cumulativeAngle = endAngle;
                      
                      return (
                        <path
                          key={idx}
                          d={pathData}
                          fill={colors[idx % colors.length]}
                          stroke="white"
                          strokeWidth="2"
                        >
                          <title>{dept.departmentName}: {dept.queryCount} ({percentage.toFixed(1)}%)</title>
                        </path>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">暫無查詢統計資料</p>
        )}
      </div>

      {/* 平均回應時間與造訪人次 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>平均回應時間</h3>
          <div className="text-center">
            <div className="text-4xl font-bold text-green-600">
              {avgResponse != null 
                ? `${avgResponse.toFixed(2)}s` 
                : '-'}
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${responseBarPercent}%`, background: 'linear-gradient(90deg, #34d399, #059669)' }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-2">以 20 秒為滿刻度，越短越好</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--ncku-red)' }}>處室造訪人次</h3>
          {visitsByDept.length > 0 ? (
            <div className="space-y-3">
              {visitsByDept.map((dept, idx) => {
                const pct = maxVisits ? Math.round((dept.visits / maxVisits) * 100) : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-gray-800">
                      <span>{dept.departmentName}</span>
                      <span className="font-semibold text-gray-900">{dept.visits} 人次</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #60a5fa, #2563eb)' }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500">暫無造訪資料</p>
          )}
        </div>
      </div>
    </div>
  );
}
