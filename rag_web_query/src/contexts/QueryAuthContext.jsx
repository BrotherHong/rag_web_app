import { createContext, useContext, useState, useEffect } from 'react';
import { 
  getQueryToken, 
  getQueryUser, 
  saveQueryUser,
  removeQueryToken,
  getCurrentQueryUser 
} from '../services/queryAuth';

const QueryAuthContext = createContext(null);

export const useQueryAuth = () => {
  const context = useContext(QueryAuthContext);
  if (!context) {
    throw new Error('useQueryAuth 必須在 QueryAuthProvider 內使用');
  }
  return context;
};

export const QueryAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 初始化：檢查本地存儲的 token 和用戶資訊
  useEffect(() => {
    const initAuth = async () => {
      const token = getQueryToken();
      const localUser = getQueryUser();

      if (token && localUser) {
        // 有 token，嘗試驗證
        try {
          const currentUser = await getCurrentQueryUser();
          setUser(currentUser);
        } catch (error) {
          console.error('驗證失敗，清除本地資料:', error);
          removeQueryToken();
          setUser(null);
        }
      }

      setLoading(false);
      setInitialized(true);
    };

    initAuth();
  }, []);

  // 登入
  const login = (userData) => {
    setUser(userData);
    saveQueryUser(userData);
  };

  // 登出（先設 loggingOut flag，讓 RequireQueryAuth 不在 navigate 前搶先 redirect）
  const logout = () => {
    setLoggingOut(true);
    removeQueryToken();
    setUser(null);
    setTimeout(() => setLoggingOut(false), 100);
  };

  // 更新用戶資訊
  const updateUser = (userData) => {
    setUser(userData);
    saveQueryUser(userData);
  };

  // 檢查是否已登入
  const isAuthenticated = () => {
    return !!user && !!getQueryToken();
  };

  const value = {
    user,
    loading,
    initialized,
    loggingOut,
    isAuthenticated,
    login,
    logout,
    updateUser
  };

  return (
    <QueryAuthContext.Provider value={value}>
      {children}
    </QueryAuthContext.Provider>
  );
};
