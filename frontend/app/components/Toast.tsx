'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import styles from '../siem.module.css';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  time: string;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TAGS: Record<ToastType, string> = {
  error:   'CRITICAL',
  success: 'OK',
  warning: 'WARN',
  info:    'INFO',
};

const DURATION = 4000;

function getTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, type, title, message, time: getTime() }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION);
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={styles.toastStack}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[`toast_${t.type}`]}`}
          >
            <div className={styles.toastHeader}>
              <span className={styles.toastPrompt}>//</span>
              <span className={styles.toastTag}>{TAGS[t.type]}</span>
              <span className={styles.toastTime}>{t.time}</span>
              <button
                className={styles.toastClose}
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                [x]
              </button>
            </div>
            <div className={styles.toastContent}>
              <span className={styles.toastCursor}>›</span>
              <span className={styles.toastTitle}>{t.title}</span>
            </div>
            {t.message && (
              <div className={styles.toastMessage}>{t.message}</div>
            )}
            <div
              className={`${styles.toastProgress} ${styles[`toastProgress_${t.type}`]}`}
              style={{ animationDuration: `${DURATION}ms` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
