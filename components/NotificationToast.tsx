
import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationToastProps {
  message: string;
  type: NotificationType;
  onClose: () => void;
  duration?: number;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ message, type, onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const config = {
    success: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-white dark:bg-slate-800', border: 'border-green-200 dark:border-green-800' },
    error: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-white dark:bg-slate-800', border: 'border-red-200 dark:border-red-800' },
    info: { icon: Info, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-white dark:bg-slate-800', border: 'border-blue-200 dark:border-blue-800' },
    warning: { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-white dark:bg-slate-800', border: 'border-orange-200 dark:border-orange-800' },
  }[type];

  return (
    <div className="fixed bottom-[calc(1.5rem+var(--app-safe-bottom,0px))] left-1/2 -translate-x-1/2 z-[1000] animate-fade-in max-w-[90vw]">
      <div className={`${config.bg} ${config.border} border shadow-xl shadow-slate-200/50 dark:shadow-black/30 backdrop-blur-xl rounded-full px-5 py-2.5 flex items-center`}>
        <config.icon className={`h-3.5 w-3.5 ${config.color} shrink-0 mr-2.5`} />
        <p className="text-[11px] md:text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap mr-2">
          {message}
        </p>
        <button onClick={onClose} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default NotificationToast;
