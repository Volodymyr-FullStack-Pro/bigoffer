'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { getSearchNowStatus, type SearchNowStatus, setAutopilot, startSearchNow } from './search-now-actions';

/** A search counts as running for at most this long after the request (queues may hold slow sources). */
const RUNNING_WINDOW_MS = 15 * 60 * 1000;
const POLL_MS = 5000;

function isRunning(s: SearchNowStatus | null, now: number): boolean {
  if (!s?.requestedAt || s.total === 0) return false;
  return s.done < s.total && now - Date.parse(s.requestedAt) < RUNNING_WINDOW_MS;
}

export function SearchNow({ initialStatus, autopilot: initialAutopilot }: { initialStatus: SearchNowStatus | null; autopilot: boolean }) {
  const t = useTranslations('searchNow');
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [autopilot, setAutopilotState] = useState(initialAutopilot);
  const [message, setMessage] = useState<'cooldown' | 'failed' | 'started' | null>(null);
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState(() => isRunning(initialStatus, Date.now()));
  const seenMatches = useRef(initialStatus?.newMatches ?? 0);

  const poll = useCallback(async () => {
    const next = await getSearchNowStatus();
    if (!next) return;
    setStatus(next);
    setRunning(isRunning(next, Date.now()));
    // New matches arrived: refresh the server-rendered feed so they show up without a reload.
    if (next.newMatches > seenMatches.current) {
      seenMatches.current = next.newMatches;
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [running, poll]);

  async function start() {
    setPending(true);
    setMessage(null);
    const res = await startSearchNow();
    setPending(false);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setMessage('started');
    seenMatches.current = 0;
    setRunning(true);
    void poll();
  }

  async function toggleAutopilot() {
    const next = !autopilot;
    setAutopilotState(next);
    if (!(await setAutopilot(next))) setAutopilotState(!next);
  }

  const total = status?.total ?? 0;
  const done = Math.min(status?.done ?? 0, total);

  return (
    <section data-testid="search-now" aria-label={t('title')} className="brutal flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-black">{t('title')}</h2>
        {running ? (
          <p role="status" data-testid="search-now-progress" className="font-mono text-sm text-muted-foreground">
            {t('progress', { done, total, found: status?.newMatches ?? 0 })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {message === 'cooldown' ? t('cooldown') : message === 'failed' ? t('failed') : status?.requestedAt && total > 0 ? t('lastDone', { found: status.newMatches }) : t('hint')}
          </p>
        )}
        {running && (
          <span aria-hidden className="mt-1 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-brand transition-[width]" style={{ width: `${total ? Math.round((done / total) * 100) : 5}%` }} />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="search-now-start" disabled={pending || running} onClick={() => void start()} className="brutal brutal-press border-brand bg-brand px-4 py-2 font-mono text-sm font-semibold text-brand-foreground disabled:opacity-60">
          {running ? t('searching') : t('start')}
        </button>
        <label className="mono-label flex cursor-pointer items-center gap-2">
          <input type="checkbox" role="switch" data-testid="autopilot" checked={autopilot} onChange={() => void toggleAutopilot()} className="size-4 accent-[var(--brand)]" />
          {t('autopilot')}
        </label>
        <Link href="/search" className="mono-label text-muted-foreground underline hover:text-foreground">
          {t('settings')}
        </Link>
      </div>
    </section>
  );
}
