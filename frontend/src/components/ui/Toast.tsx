import { createContext, useContext, useMemo, useRef, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { kind: ToastKind; message: string };

type ToastContextValue = {
  toast: Toast | null;
  showToast: (toast: Toast, durationMs?: number) => void;
  clearToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<number | null>(null);

  const value = useMemo<ToastContextValue>(() => {
    return {
      toast,
      showToast: (next, durationMs = 3000) => {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
        }
        setToast(next);
        timerRef.current = window.setTimeout(() => {
          setToast(null);
          timerRef.current = null;
        }, durationMs);
      },
      clearToast: () => {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setToast(null);
      },
    };
  }, [toast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

export function ToastHost() {
  const ctx = useContext(ToastContext);
  if (!ctx?.toast) return null;
  return <div className={`toast toast-${ctx.toast.kind}`}>{ctx.toast.message}</div>;
}
