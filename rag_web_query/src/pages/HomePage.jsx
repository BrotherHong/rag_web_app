import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFaqList } from '../services/api'
import { useDepartment } from '../contexts/DepartmentContext'
import { APP_CONSTANTS } from '../config/constants'

function HomePage() {
  const navigate = useNavigate()
  const { department, deptSlug, loading: deptLoading } = useDepartment()
  const [faqList, setFaqList] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // 從後端獲取常見問題列表（首頁只顯示前 4 個）
  useEffect(() => {
    const fetchFaqList = async () => {
      try {
        setIsLoading(true)
        const response = await getFaqList(4) // 只獲取前 4 個問題
        if (response.success) {
          setFaqList(response.data)
        } else {
          console.error('Failed to fetch FAQ list:', response.error)
          // 如果獲取失敗，使用空陣列
          setFaqList([])
        }
      } catch (error) {
        console.error('Error fetching FAQ list:', error)
        setFaqList([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchFaqList()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-red-50 to-white relative overflow-hidden">
      {/* 背景動畫效果 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute w-96 h-96 bg-red-100/50 rounded-full blur-3xl -top-48 -left-48 animate-pulse-slow"></div>
        <div className="absolute w-96 h-96 bg-red-200/40 rounded-full blur-3xl -bottom-48 -right-48 animate-pulse-slow delay-1000"></div>
        <div className="absolute w-96 h-96 bg-red-50/60 rounded-full blur-3xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-slow delay-500"></div>
      </div>

      {/* 網格背景 */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>

      {/* 主要內容 */}
      <div className="relative z-10 container mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center min-h-screen">
          {/* 標題區域 */}
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-block mb-6">
              <div className="relative">
                {/* 成功大學 Logo */}
                <div className="w-32 h-32 mx-auto mb-6 relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-red-700/20 rounded-2xl rotate-6 animate-pulse-slow"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-red-700/20 to-red-500/20 rounded-2xl -rotate-6 animate-pulse-slow delay-300"></div>
                  <div className="absolute inset-0 bg-white rounded-2xl shadow-xl flex items-center justify-center p-4">
                    <img 
                      src={APP_CONSTANTS.UNIVERSITY.LOGO_PATH}
                      alt={APP_CONSTANTS.UNIVERSITY.NAME}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-red-700 via-red-600 to-red-700 bg-clip-text text-transparent animate-gradient">
              {department ? department.name + ' AI助手' : 'AI助手'}
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-700 mb-4">
              {department?.description || APP_CONSTANTS.APP_SUBTITLE}
            </p>
            
            {department && (
              <p className="text-sm text-gray-600">
                {department.fullName} | {department.contact.phone} 分機 {department.contact.extension}
              </p>
            )}
            
            <p className="text-xl md:text-2xl text-gray-700 mb-12 mt-4">
              {APP_CONSTANTS.APP_SUBTITLE}
            </p>
          </div>

          {/* 常見問題快速按鈕區域 */}
          <div className="w-full max-w-4xl mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">常見問題</h2>
            
            {isLoading ? (
              // 載入中狀態
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
              </div>
            ) : faqList.length === 0 ? (
              // 無 FAQ 時顯示提示
              <div className="text-center py-12 text-gray-500">
                <p>目前暫無常見問題</p>
              </div>
            ) : (
              <div className={`grid gap-4 ${
                faqList.length === 1 ? 'grid-cols-1 max-w-md mx-auto' :
                faqList.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
                faqList.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
                'grid-cols-1 md:grid-cols-2 lg:grid-cols-2'
              }`}>
                {faqList.map((faq) => (
                  <button 
                    key={faq.id}
                    onClick={() => navigate(`/${deptSlug}/chat`, { state: { question: faq.question } })}
                    className="group bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-4 hover:bg-red-50 hover:shadow-lg transition-all duration-300 hover:border-red-300 text-center cursor-pointer"
                  >
                    <div className="flex flex-col items-center gap-2">
                      {/* 使用 emoji icon 或預設問號圖示 */}
                      {faq.icon ? (
                        <span className="text-3xl">{faq.icon}</span>
                      ) : (
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      <div>
                        <h3 className="text-gray-800 font-medium mb-1 group-hover:text-red-700 transition-colors">{faq.question}</h3>
                        {faq.description && (
                          <p className="text-sm text-gray-600">{faq.description}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 開始按鈕 */}
          <div className="mt-12">
            <button 
              onClick={() => navigate(`/${deptSlug}/chat`)}
              className="group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 rounded-full text-white font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all hover:from-red-700 hover:to-red-800 cursor-pointer"
            >
              <span className="relative z-10">開始使用</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
