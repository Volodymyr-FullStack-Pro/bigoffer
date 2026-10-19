'use client';

import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HoverBorderGradient } from '@/components/aceternity/hover-border-gradient';
import { Link } from '@/i18n/navigation';
import {
  getSearchNowStatus,
  type SearchNowStatus,
  setAutopilot,
  startSearchNow,
} from './search-now-actions';

/** A search counts as running for at most this long after the request (queues may hold slow sources). */
const RUNNING_WINDOW_MS = 15 * 60 * 1000;
const POLL_MS = 5000;

function isRunning(s: SearchNowStatus | null, now: number): boolean {
  if (!s?.requestedAt || s.total === 0) return false;
  return s.done < s.total && now - Date.parse(s.requestedAt) < RUNNING_WINDOW_MS;
}

export function SearchNow({
  initialStatus,
  autopilot: initialAutopilot,
}: {
  initialStatus: SearchNowStatus | null;
  autopilot: boolean;
}) {
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
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Idle: one slim toolbar beside the page title. A run or its result adds a short status line under it.
  const statusText = running
    ? t('progress', { done, total, found: status?.newMatches ?? 0 })
    : message === 'cooldown'
      ? t('cooldown')
      : message === 'failed'
        ? t('failed')
        : status?.requestedAt && total > 0
          ? t('lastDone', { found: status.newMatches })
          : null;

  return (
    <section data-testid="search-now" aria-label={t('title')} className="flex flex-col items-start gap-1.5 md:items-end">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {running ? (
          <span
            data-testid="search-now-running"
            className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-1.5 text-sm font-semibold text-link"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('searching')}
            <span className="tabular-nums text-xs opacity-80">{pct}%</span>
          </span>
        ) : (
          <HoverBorderGradient data-testid="search-now-start" disabled={pending} onClick={() => void start()} className="px-4 py-1.5 text-sm font-semibold">
            {pending ? <Loader2 className="mr-1.5 inline size-4 animate-spin" aria-hidden /> : <Search className="mr-1.5 inline size-4 -translate-y-px" aria-hidden />}
            {t('start')}
          </HoverBorderGradient>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            role="switch"
            data-testid="autopilot"
            checked={autopilot}
            onChange={() => void toggleAutopilot()}
            className="size-4 accent-[var(--brand)]"
          />
          {t('autopilot')}
        </label>
        <Link href="/search" title={t('settings')} aria-label={t('settings')} className="brutal-press inline-flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
          <SlidersHorizontal className="size-4" aria-hidden />
        </Link>
      </div>
      {statusText && (
        <p role="status" data-testid={running ? 'search-now-progress' : undefined} className="tabular-nums text-xs text-muted-foreground">
          {statusText}
        </p>
      )}
      {running && (
        <span aria-hidden className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <span className="progress-sweep block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(pct, 6)}%` }} />
        </span>
      )}
    </section>
  );
}
