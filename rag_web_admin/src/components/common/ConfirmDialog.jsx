/**
 * ConfirmDialog - 確認對話框組件
 * 用於刪除、登出等需要用戶確認的操作
 */

function ConfirmDialog({ 
  isOpen,
  shouldRender,
  isClosing,
  animationClass,
  contentAnimationClass,
  onClose, 
  onConfirm, 
  title = '確認操作', 
  message = '確定要執行此操作嗎？',
  confirmText = '確認',
  cancelText = '取消',
  type = 'danger' // 'danger', 'warning', 'info'
}) {
  // 使用 shouldRender 來決定是否渲染（支援關閉動畫）
  // 如果沒有傳入 shouldRender，則使用 isOpen
  const show = shouldRender !== undefined ? shouldRender : isOpen;
  
  if (!show) return null;

  // 根據類型決定樣式
  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: (
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          iconBg: 'bg-red-100',
          confirmButton: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
        };
      case 'warning':
        return {
          icon: (
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          iconBg: 'bg-yellow-100',
          confirmButton: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
        };
      case 'info':
        return {
          icon: (
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          iconBg: 'bg-blue-100',
          confirmButton: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
        };
      default:
        return {
          icon: null,
          iconBg: 'bg-gray-100',
          confirmButton: 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500'
        };
    }
  };

  const styles = getTypeStyles();
  
  // 使用傳入的動畫 class，如果沒有則使用預設動畫
  const bgAnimation = animationClass || 'animate-fadeIn';
  const contentAnimation = contentAnimationClass || 'animate-scaleIn';

  return (
    <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center ${bgAnimation}`}>
      <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 ${contentAnimation}`}>
        {/* 圖標 */}
        <div className="flex items-center justify-center mb-4">
          <div className={`${styles.iconBg} rounded-full p-3`}>
            {styles.icon}
          </div>
        </div>

        {/* 標題 */}
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
          {title}
        </h3>

        {/* 訊息 */}
        <div className="text-sm text-gray-500 text-center mb-6 whitespace-pre-line">
          {message}
        </div>

        {/* 按鈕 */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 px-4 py-2 border border-transparent rounded-lg text-white ${styles.confirmButton} focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors cursor-pointer`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
