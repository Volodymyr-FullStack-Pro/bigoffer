'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { startPrep } from './actions';

/** Builds the prep plan for a card and opens it; `auto` starts at once (the board panel's "Prepare" button). */
export function StartPrep({ applicationId, auto = false }: { applicationId: string; auto?: boolean }) {
  const t = useTranslations('prep');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await startPrep(applicationId);
      if (res.ok) return router.push(`/prep/${res.id}`);
      setError(res.error);
    } catch {
      setError('failed');
    }
    setBusy(false);
  };

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void run();
    // Runs once for the card the board sent here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <span className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" data-testid="prep-error" className="text-sm text-danger">{t(`err_${error}` as never)}</span>}
      <button type="button" data-testid="prep-start" disabled={busy} onClick={() => void run()} className="brutal brutal-press bg-ai px-3 py-1.5 text-sm font-semibold text-ai-foreground disabled:opacity-60">
        {busy ? t('planning') : `🎓 ${t('start')}`}
      </button>
    </span>
  );
}
