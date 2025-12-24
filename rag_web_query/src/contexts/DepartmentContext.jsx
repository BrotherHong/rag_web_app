import { createContext, useContext, useState, useEffect } from 'react'
import { getDepartmentInfo, setCurrentDepartment } from '../services/api'

// 輔助函數：獲取預設聯絡資訊
const getDefaultContact = (deptSlug) => {
  const contacts = {
    'hr': {
      phone: '(06) 275-7575',
      extension: '50200',
      email: 'hr@ncku.edu.tw'
    },
    'acc': {
      phone: '(06) 275-7575',
      extension: '50300',
      email: 'acc@ncku.edu.tw'
    },
    'ga': {
      phone: '(06) 275-7575',
      extension: '50400',
      email: 'ga@ncku.edu.tw'
    }
  }
  return contacts[deptSlug] || {
    phone: '(06) 275-7575',
    extension: '50000',
    email: 'info@ncku.edu.tw'
  }
}

const DepartmentContext = createContext()

export const useDepartment = () => {
  const context = useContext(DepartmentContext)
  if (!context) {
    throw new Error('useDepartment must be used within DepartmentProvider')
  }
  return context
}

export const DepartmentProvider = ({ children, deptSlug }) => {
  const [department, setDepartment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const fetchDepartment = async () => {
      if (!deptSlug) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setNotFound(false)
        
        const response = await getDepartmentInfo(deptSlug)
        if (response.success) {
          // 擴展處室資訊，添加前端需要的額外欄位
          const enrichedDept = {
            ...response.data,
            fullName: response.data.fullName || `國立成功大學${response.data.name}`,
            contact: response.data.contact || getDefaultContact(deptSlug)
          }
          
          setDepartment(enrichedDept)
          // 設定全域當前處室（包含 ID，讓 API 請求自動帶入）
          setCurrentDepartment(deptSlug, enrichedDept.id)
          // 設定動態主題色到 CSS 變數
          document.documentElement.style.setProperty('--dept-color', enrichedDept.color)
        } else {
          // 處室不存在
          setNotFound(true)
          setError(response.error || '處室不存在')
        }
      } catch (err) {
        console.error('Error fetching department:', err)
        setNotFound(true)
        setError('載入處室資訊時發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchDepartment()
  }, [deptSlug])

  return (
    <DepartmentContext.Provider value={{ department, deptSlug, loading, error, notFound }}>
      {children}
    </DepartmentContext.Provider>
  )
}
