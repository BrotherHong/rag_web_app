import { useNavigate } from 'react-router-dom'
import { useDepartment } from '../contexts/DepartmentContext'
import { APP_CONSTANTS } from '../config/constants'

function HomePage() {
  const navigate = useNavigate()
  const { department, deptSlug } = useDepartment()

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-gradient-to-br from-white via-red-50 to-white relative overflow-hidden flex flex-col">
      {/* 背景光暈 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[600px] h-[600px] bg-red-100/40 rounded-full blur-3xl -top-64 -left-64 animate-pulse-slow"></div>
        <div className="absolute w-[600px] h-[600px] bg-red-200/30 rounded-full blur-3xl -bottom-64 -right-64 animate-pulse-slow delay-1000"></div>
      </div>

      {/* 主要內容：垂直置中填滿剩餘高度 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Logo */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-red-700/20 rounded-3xl rotate-6 animate-pulse-slow"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-red-700/20 to-red-500/20 rounded-3xl -rotate-6 animate-pulse-slow delay-300"></div>
          <div className="relative w-44 h-44 bg-white rounded-3xl shadow-2xl flex items-center justify-center p-5">
            <img
              src={APP_CONSTANTS.UNIVERSITY.LOGO_PATH}
              alt={APP_CONSTANTS.UNIVERSITY.NAME}
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* 標題 */}
        <h1 className="text-5xl md:text-7xl font-extrabold mb-4 text-center bg-gradient-to-r from-red-800 via-red-600 to-red-800 bg-clip-text text-transparent leading-tight">
          {department?.assistant_name || 'AI助手'}
        </h1>

        <p className="text-xl md:text-2xl text-gray-600 mb-3 text-center max-w-xl">
          {department?.description || APP_CONSTANTS.APP_SUBTITLE}
        </p>

        {department && (
          <p className="text-sm text-gray-500 mb-8">
            {department.fullName}&ensp;|&ensp;{department.contact.phone}
          </p>
        )}

        {/* 按鈕 */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={() => navigate('/login', { state: { from: `/${deptSlug}/chat` } })}
            className="px-10 py-4 bg-gradient-to-r from-red-700 to-red-800 rounded-full text-white font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
          >
            登入
          </button>
          <button
            onClick={() => navigate('/register', { state: { from: `/${deptSlug}/chat` } })}
            className="px-10 py-4 border-2 border-red-700 rounded-full text-red-700 font-bold text-lg hover:bg-red-50 hover:scale-105 transition-all cursor-pointer"
          >
            註冊
          </button>
        </div>

        {/* 底部特色說明 */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full">
          {[
            { icon: '🔍', title: '智慧查詢', desc: '即時回答各類行政問題' },
            { icon: '📚', title: '知識庫支援', desc: '根據最新文件精準作答' },
            { icon: '🔒', title: '安全登入', desc: '支援成大成功入口 SSO' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-red-100 text-center">
              <div className="text-3xl mb-2">{icon}</div>
              <div className="font-semibold text-gray-800 mb-1">{title}</div>
              <div className="text-sm text-gray-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HomePage
