import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

const Toast = ({ id, type = 'info', message, duration = 3000, onClose }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, id, onClose]);

  const typeConfig = {
    success: {
      icon: CheckCircle2,
      bgColor: 'bg-green-600',
      iconColor: 'text-white',
      textColor: 'text-white'
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-red-600',
      iconColor: 'text-white',
      textColor: 'text-white'
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-amber-500',
      iconColor: 'text-white',
      textColor: 'text-white'
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-600',
      iconColor: 'text-white',
      textColor: 'text-white'
    }
  };

  const config = typeConfig[type] || typeConfig.info;
  const IconComponent = config.icon;

  return (
    <div
      className={`
        flex items-center gap-3 p-4 rounded-lg shadow-xl
        ${config.bgColor}
        animate-slideInRight
        min-w-[320px] max-w-md
        border border-white/20
      `}
    >
      <IconComponent className={`w-6 h-6 ${config.iconColor} flex-shrink-0`} />
      
      <p className={`flex-1 text-sm font-medium ${config.textColor} leading-relaxed`}>
        {message}
      </p>

      <button
        onClick={() => onClose(id)}
        className="text-white/80 hover:text-white transition-colors flex-shrink-0 hover:bg-white/10 rounded p-1"
        aria-label="關閉通知"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Toast;
