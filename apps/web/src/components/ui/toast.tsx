'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastState = { message: string; tone?: 'info' | 'error'; undoLabel?: string; onUndo?: () => void } | null;

/** One toast at a time; it closes itself after `ms` (5 s by default). */
export function useToast(ms = 5000) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (next: NonNullable<ToastState>) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      timer.current = setTimeout(() => setToast(null), ms);
    },
    [ms],
  );
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { toast, show, close };
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      data-testid="toast"
      className={`brutal fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 px-4 py-3 md:bottom-8 ${
        toast.tone === 'error' ? 'bg-danger text-white' : ''
      }`}
    >
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          data-testid="toast-undo"
          className="font-mono text-sm font-bold underline"
          onClick={() => {
            toast.onUndo?.();
            onClose();
          }}
        >
          {toast.undoLabel}
        </button>
      )}
    </div>
  );
}
