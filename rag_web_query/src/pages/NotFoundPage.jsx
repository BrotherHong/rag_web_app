import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDepartmentList } from '../services/api'

function NotFoundPage() {
  const navigate = useNavigate()
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await getDepartmentList({ limit: 100 })
        if (response.success && response.data.items) {
          setDepartments(response.data.items)
        } else {
          console.error('Failed to fetch departments:', response.error)
        }
      } catch (error) {
        console.error('Error fetching departments:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDepartments()
  }, [])

  // 獲取適合的背景顏色（淡化版本）
  const getLightColor = (color) => {
    if (!color) return 'bg-gray-50'
    // 如果是 hex 顏色，轉換為淡色
    if (color.startsWith('#')) {
      const rgb = parseInt(color.slice(1), 16)
      const r = (rgb >> 16) & 255
      const g = (rgb >> 8) & 255
      const b = rgb & 255
      return `rgba(${r}, ${g}, ${b}, 0.1)`
    }
    return 'bg-gray-50'
  }

  // 獲取適合的懸停顏色
  const getHoverColor = (color) => {
    if (!color) return 'bg-gray-100'
    if (color.startsWith('#')) {
      const rgb = parseInt(color.slice(1), 16)
      const r = (rgb >> 16) & 255
      const g = (rgb >> 8) & 255
      const b = rgb & 255
      return `rgba(${r}, ${g}, ${b}, 0.2)`
    }
    return 'bg-gray-100'
  }

  // 獲取文字顏色
  const getTextColor = (color) => {
    if (!color) return 'text-gray-700'
    return 'text-gray-800'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* 404 圖示 */}
        <div className="mb-6">
          <div className="text-8xl font-bold text-red-600 mb-2">404</div>
          <div className="text-2xl font-semibold text-gray-800 mb-2">找不到此處室</div>
          <p className="text-gray-600">
            您訪問的處室不存在或已被移除
          </p>
        </div>

        {/* 分隔線 */}
        <div className="my-6 border-t border-gray-200"></div>

        {/* 可用處室列表 */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">可用的處室：</h3>
          
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent"></div>
            </div>
          ) : departments.length === 0 ? (
            <p className="text-gray-500 py-4">暫無可用處室</p>
          ) : (
            <div className="space-y-2">
              {departments.map((dept) => (
                <button
                  key={dept.id}
                  onClick={() => navigate(`/${dept.slug}`)}
                  className="w-full px-4 py-3 rounded-lg transition-all flex items-center justify-between group"
                  style={{
                    backgroundColor: getLightColor(dept.color),
                    color: dept.color || '#374151'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = getHoverColor(dept.color)
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = getLightColor(dept.color)
                  }}
                >
                  <span className="font-medium">{dept.name}</span>
                  <span 
                    className="text-xs group-hover:translate-x-1 transition-transform"
                    style={{ color: dept.color || '#6B7280' }}
                  >
                    →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 返回首頁按鈕 */}
        <button
          onClick={() => navigate(departments.length > 0 ? `/${departments[0].slug}` : '/')}
          disabled={loading || departments.length === 0}
          className="w-full px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          返回首頁
        </button>
      </div>
    </div>
  )
}

export default NotFoundPage
