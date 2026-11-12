import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthToastProps {
  type: 'success' | 'error';
  message: string;
}

export const AuthToast: React.FC<AuthToastProps> = ({ type, message }) => {
  const isSuccess = type === 'success';

  return (
    <div
      className={`fixed top-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 shadow-lg ${
        isSuccess
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2 text-sm">
        {isSuccess ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
        <span>{message}</span>
      </div>
    </div>
  );
};

export default AuthToast;
