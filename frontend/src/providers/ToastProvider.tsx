import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Toast, ToastViewport, type ToastTone } from '@/components/ui';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  toasts: ToastMessage[];
  show: (toast: { title: string; description?: string; tone?: ToastTone }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: { title: string; description?: string; tone?: ToastTone }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, tone: toast.tone ?? 'info', ...toast }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toasts, show, dismiss }), [dismiss, show, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            title={toast.title}
            description={toast.description}
            tone={toast.tone}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </ToastViewport>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return context;
}
