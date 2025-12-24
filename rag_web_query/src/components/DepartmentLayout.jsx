import { Outlet, useParams, Navigate } from 'react-router-dom'
import { DepartmentProvider, useDepartment } from '../contexts/DepartmentContext'

function DepartmentContent() {
  const { notFound, loading } = useDepartment()

  // 載入中顯示 loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    )
  }

  // 處室不存在，導向 404 頁面
  if (notFound) {
    return <Navigate to="/404" replace />
  }

  return <Outlet />
}

function DepartmentLayout() {
  const { deptSlug } = useParams()

  return (
    <DepartmentProvider deptSlug={deptSlug}>
      <DepartmentContent />
    </DepartmentProvider>
  )
}

export default DepartmentLayout
