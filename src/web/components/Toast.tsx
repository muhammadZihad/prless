import { useEffect } from 'react';

export interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

interface Props {
  toast: ToastState | null;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ toast, onDismiss, duration = 4000 }: Props) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [toast, duration, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden>
        {toast.tone === 'success' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        )}
      </span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
