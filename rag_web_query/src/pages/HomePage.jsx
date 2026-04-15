import { useNavigate } from 'react-router-dom'
import { useDepartment } from '../contexts/DepartmentContext'
import { APP_CONSTANTS } from '../config/constants'

function HomePage() {
  const navigate = useNavigate()
  const { department, deptSlug } = useDepartment()

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
                {department.fullName} | {department.contact.phone}
              </p>
            )}
          </div>

          {/* 登入按鈕 */}
          <div className="mt-12">
            <button 
              onClick={() => navigate('/login', { state: { from: `/${deptSlug}/chat` } })}
              className="group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 rounded-full text-white font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all hover:from-red-700 hover:to-red-800 cursor-pointer"
            >
              <span className="relative z-10">登入</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
