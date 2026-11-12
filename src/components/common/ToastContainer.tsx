import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { Toast } from '../../hooks/useToast';

const config: Record<Toast['type'], { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: <CheckCircle2 className="w-4 h-4 shrink-0" /> },
  error:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   icon: <AlertCircle className="w-4 h-4 shrink-0" /> },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: <AlertTriangle className="w-4 h-4 shrink-0" /> },
  info:    { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  icon: <Info className="w-4 h-4 shrink-0" /> },
};

interface ToastContainerProps {
  toasts: Toast[];
  dismiss: (id: number) => void;
  className?: string;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, dismiss, className }) => {
  if (toasts.length === 0) return null;
  return (
    <div className={`${className ?? 'fixed top-4 right-4'} z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none`}>
      {toasts.map(toast => {
        const c = config[toast.type];
        return (
          <div
            key={toast.id}
            className={`${c.bg} ${c.border} border ${c.text} rounded-lg px-4 py-3 shadow-lg pointer-events-auto flex items-start gap-2 text-sm animate-slide-in`}
            role="alert"
          >
            {c.icon}
            <span className="flex-1 break-words">{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} aria-label="Dismiss notification" className="shrink-0 hover:opacity-70">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
