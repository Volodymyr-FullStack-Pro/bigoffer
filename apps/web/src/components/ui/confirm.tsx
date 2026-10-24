'use client';

import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { useModalDialog } from './use-modal-dialog';

type Options = { confirmLabel?: string; danger?: boolean };
type Ask = (message: string, options?: Options) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** `await confirm('Delete this card?')` — the site's own modal instead of the browser's grey box. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm needs <ConfirmProvider>');
  return ask;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ message: string; options: Options } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((message, options = {}) => {
    resolver.current?.(false);
    setPending({ message, options });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && <ConfirmDialog key={pending.message} message={pending.message} options={pending.options} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ message, options, onSettle }: { message: string; options: Options; onSettle: (ok: boolean) => void }) {
  const t = useTranslations('app');
  const cancel = useCallback(() => onSettle(false), [onSettle]);
  const [dialogRef, onDialogCancel] = useModalDialog(cancel);
  const danger = options.danger ?? true;
  return (
    <dialog
      ref={dialogRef}
      onCancel={onDialogCancel}
      // A click on the dimmed backdrop lands on the <dialog> itself and cancels.
      onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}
      aria-labelledby="confirm-message"
      data-testid="confirm-dialog"
      className="m-auto w-full max-w-sm bg-transparent p-4 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        className="brutal flex w-full flex-col gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSettle(true);
        }}
      >
        <p id="confirm-message" className="text-base font-semibold leading-snug">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" data-testid="confirm-cancel" onClick={cancel} className="rounded-md px-4 py-2 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
            {t('confirmCancel')}
          </button>
          <button
            type="submit"
            data-testid="confirm-ok"
            autoFocus
            className={`btn brutal-press px-4 py-2 font-semibold ${danger ? 'bg-danger text-background' : 'bg-brand text-brand-foreground'}`}
          >
            {options.confirmLabel ?? t(danger ? 'confirmDelete' : 'confirmOk')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
