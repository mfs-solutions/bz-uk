import { useState, useCallback, useRef } from 'react';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export function useToast(autoDismissMs = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((type: Toast['type'], message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), autoDismissMs);
    return id;
  }, [autoDismissMs, dismiss]);

  const success = useCallback((msg: string) => show('success', msg), [show]);
  const error = useCallback((msg: string) => show('error', msg), [show]);
  const warning = useCallback((msg: string) => show('warning', msg), [show]);
  const info = useCallback((msg: string) => show('info', msg), [show]);

  return { toasts, show, success, error, warning, info, dismiss };
}
