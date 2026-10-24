'use client';

import { type SyntheticEvent, useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Native modal <dialog>: the browser makes the background inert, traps Tab and focuses the first control.
 * Escape closes (via onClose); on unmount focus returns to the opener — or to the same board card when the
 * opener was re-created by a drag into another column.
 */
export function useModalDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cardId = opener?.closest('[data-card-id]')?.getAttribute('data-card-id') ?? null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      setTimeout(() => {
        const target = opener?.isConnected ? opener : cardId ? document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`) : null;
        target?.focus();
      }, 0);
    };
  }, []);

  const onCancel = useCallback(
    (e: SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  return [ref, onCancel] as const;
}
