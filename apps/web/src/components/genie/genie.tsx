'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { type GenieMemory, type GenieMessage, type GeniePageHint, type GenieState, MOTIVATION_COUNT, pickMessage, routeOf } from '@/lib/genie/brain';
import { GENIE_EVENT, type GenieEvent } from '@/lib/genie/events';
import { getGenieState } from './actions';
import { Confetti } from '@/app/[locale]/(app)/board/confetti';
import { GenieAvatar, GenieLamp } from './genie-avatar';

const MEMORY_KEY = 'bigoffer:genie:memory';
const FOLDED_KEY = 'bigoffer:genie:folded';
const REFRESH_MS = 5 * 60_000;
const AUTO_HIDE_MS = 14_000;
/** Automated browsers (e2e) get no genie floating over the page, unless a test opts in. */
const E2E_FLAG = 'bigoffer:genie:e2e';

function enabledHere(): boolean {
  try {
    return !navigator.webdriver || localStorage.getItem(E2E_FLAG) === '1';
  } catch {
    return true;
  }
}

function readMemory(): GenieMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? 'null') as GenieMemory | null;
    if (raw && typeof raw === 'object' && raw.shown) return raw;
  } catch {
    // storage blocked: start fresh
  }
  return { shown: {}, lastMotivationAt: 0 };
}

function writeMemory(m: GenieMemory): void {
  try {
    // Keep the memory small: drop entries older than a week.
    const cutoff = Date.now() - 7 * 24 * 3600_000;
    const shown = Object.fromEntries(Object.entries(m.shown).filter(([, at]) => at > cutoff));
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...m, shown }));
  } catch {
    // ignore
  }
}

/** Goal progress ring around the genie: today's applications of the daily goal. */
function GoalRing({ done, goal }: { done: number; goal: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, done / Math.max(1, goal));
  return (
    <svg viewBox="0 0 68 68" className="pointer-events-none absolute -inset-1.5 size-[calc(100%+12px)]" aria-hidden>
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <motion.circle
        cx="34"
        cy="34"
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - p) }}
        transform="rotate(-90 34 34)"
      />
    </svg>
  );
}

/**
 * Offer Genie: lives in the bottom-left corner of every app page, brings one useful thing at a time (setup
 * problems, the daily goal, fresh strong matches, page tips, a daily "all good"), cheers applications and offers,
 * and fills quiet moments with a short motto. Closable, foldable into its lamp, mode set in the profile.
 */
export function Genie() {
  const t = useTranslations('genie');
  const pathname = usePathname();
  const route = routeOf(`/x${pathname}`);
  const [state, setState] = useState<GenieState | null>(null);
  const [message, setMessage] = useState<GenieMessage | null>(null);
  // Nothing renders before the state arrives, so reading storage here cannot cause a hydration mismatch.
  const [folded, setFolded] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(FOLDED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [hint, setHint] = useState<GeniePageHint>(null);
  const memory = useRef<GenieMemory>({ shown: {}, lastMotivationAt: 0 });
  const [confetti, setConfetti] = useState(false);
  // Something important waits while the genie sits in its lamp: the lamp glows with a dot.
  const [pending, setPending] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((m: GenieMessage | null) => {
    clearTimeout(hideTimer.current);
    setMessage(m);
    if (!m) return;
    const now = Date.now();
    memory.current = {
      shown: { ...memory.current.shown, [m.id]: now },
      lastMotivationAt: m.kind === 'motivation' ? now : memory.current.lastMotivationAt,
    };
    writeMemory(memory.current);
    // Light messages leave by themselves; problems and goal nudges stay until closed.
    if (m.kind === 'motivation' || m.kind === 'celebrate' || m.id.startsWith('health:ok')) {
      hideTimer.current = setTimeout(() => setMessage(null), AUTO_HIDE_MS);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabledHere()) return null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const next = await getGenieState(tz).catch(() => null);
    if (next) setState(next);
    return next;
  }, []);

  useEffect(() => {
    memory.current = readMemory();
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  useEffect(() => {
    if (!state || !folded) return;
    const next = pickMessage(state, route, memory.current, Date.now(), hint);
    const id = setTimeout(() => setPending(Boolean(next && next.kind !== 'motivation')), 0);
    return () => clearTimeout(id);
  }, [state, folded, route, hint]);

  // Speak at most once per page visit, a moment after the page settles.
  useEffect(() => {
    if (!state || folded) return;
    const id = setTimeout(() => show(pickMessage(state, route, memory.current, Date.now(), hint)), 1500);
    return () => clearTimeout(id);
    // hint changes are picked up by the next page visit or refresh, not re-spoken immediately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, route, folded, show]);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent<GenieEvent>).detail;
      if (ev.type === 'hint') setHint({ key: ev.key, params: ev.params, action: ev.action });
      else if (ev.type === 'clearHint') setHint(null);
      else {
        void refresh().then((s) => {
          if (!s || s.mode === 'off') return;
          const done = s.appliedToday;
          const goalNow = ev.type === 'applied' && done === s.goal;
          if (goalNow || ev.type === 'offer') setConfetti(true);
          show({
            id: `celebrate:${ev.type}:${Date.now()}`,
            kind: 'celebrate',
            mood: 'excited',
            key: ev.type === 'offer' ? 'cheerOffer' : ev.type === 'applied' ? (done >= s.goal ? 'cheerGoal' : 'cheerApplied') : 'cheerSaved',
            params: { done, goal: s.goal, left: Math.max(0, s.goal - done) },
            action: ev.type === 'saved' ? { href: '/board', labelKey: 'actBoard' } : undefined,
          });
        });
      }
    };
    window.addEventListener(GENIE_EVENT, onEvent);
    return () => window.removeEventListener(GENIE_EVENT, onEvent);
  }, [refresh, show]);

  // Follow a tip: close the bubble; for "#section" links scroll there and glow once the page has it.
  const go = (href: string) => {
    setMessage(null);
    const hash = href.split('#')[1];
    if (!hash) return;
    let tries = 0;
    const find = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('genie-flash');
        void el.offsetWidth;
        el.classList.add('genie-flash');
      } else if (tries++ < 30) setTimeout(find, 100);
    };
    setTimeout(find, 150);
  };

  if (!state || state.mode === 'off') return (confetti ? <Confetti onDone={() => setConfetti(false)} /> : null);

  const fold = (v: boolean) => {
    setFolded(v);
    if (v) setMessage(null);
    try {
      localStorage.setItem(FOLDED_KEY, v ? '1' : '0');
    } catch {
      // ignore
    }
  };

  // A click always answers: the next useful thing, else a motto.
  const poke = () => {
    if (message) return setMessage(null);
    const next = pickMessage(state, route, memory.current, Date.now(), hint);
    show(next ?? { id: `motivation:poke:${Date.now()}`, kind: 'motivation', mood: 'happy', key: `motto${Math.floor(Math.random() * MOTIVATION_COUNT)}` });
  };

  if (folded) {
    return (
      <button
        type="button"
        data-testid="genie-lamp"
        onClick={() => fold(false)}
        aria-label={t('open')}
        className="brutal-press fixed right-3 bottom-[8.5rem] z-40 grid size-11 place-items-center rounded-full border border-border bg-card shadow-lg md:right-auto md:bottom-5 md:left-5"
        style={pending ? { boxShadow: '0 0 0 2px var(--brand), 0 0 18px rgb(115 247 178 / 0.5)' } : undefined}
      >
        <GenieLamp size={30} />
        {pending && <span data-testid="genie-lamp-dot" aria-hidden className="absolute top-1 right-1 size-2.5 animate-pulse rounded-full bg-brand" />}
      </button>
    );
  }

  return (
    // Phone: bottom-right above the nav and the card actions; desktop: bottom-left under the sidebar. The bubble opens
    // above the genie, so on desktop it stays over the sidebar instead of covering the feed.
    <div data-testid="genie" className="pointer-events-none fixed right-3 bottom-[8.5rem] z-40 flex max-w-[calc(100vw-1.5rem)] flex-col-reverse items-end gap-2 md:right-auto md:bottom-5 md:left-5 md:items-start">
      <div className="pointer-events-auto relative shrink-0">
        <button type="button" data-testid="genie-avatar" onClick={poke} aria-label={t('name')} className="relative grid size-12 place-items-center rounded-full bg-card/80 backdrop-blur md:size-16 md:bg-transparent">
          <GoalRing done={state.appliedToday} goal={state.goal} />
          <GenieAvatar mood={message?.mood ?? (state.appliedToday >= state.goal ? "happy" : "neutral")} size={40} />
        </button>
        <span data-testid="genie-goal" className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card px-1.5 font-mono text-[10px] font-bold text-link">
          {Math.min(state.appliedToday, 99)}/{state.goal}
        </span>
        {state.streak >= 2 && (
          <span data-testid="genie-streak" title={t('streak', { days: state.streak })} className="absolute -top-1 -right-1 rounded-full border border-warning/50 bg-card px-1 font-mono text-[10px] font-bold text-warning">
            🔥{state.streak}
          </span>
        )}
        {confetti && <Confetti onDone={() => setConfetti(false)} />}
      </div>
      <AnimatePresence>
        {message && (
          <motion.div
            key={message.id}
            role="status"
            data-testid="genie-bubble"
            data-kind={message.kind}
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={`pointer-events-auto relative w-72 max-w-full rounded-2xl rounded-br-sm border bg-card/95 p-3.5 pr-8 text-sm shadow-xl backdrop-blur md:w-56 md:rounded-br-2xl md:rounded-bl-sm ${
              message.mood === 'worried' ? 'border-warning/60' : 'border-brand/40'
            }`}
          >
            <p className="leading-snug">{t(message.key as 'motto0', message.params as never)}</p>
            {message.action && (
              <Link href={message.action.href} onClick={() => go(message.action!.href)} className="mt-2 inline-block rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
                {t(message.action.labelKey as 'actFeed')} →
              </Link>
            )}
            <button type="button" aria-label={t('close')} onClick={() => setMessage(null)} className="absolute top-2 right-2 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              ×
            </button>
            <button type="button" data-testid="genie-fold" onClick={() => fold(true)} className="mt-2 block text-[11px] text-muted-foreground underline">
              {t('fold')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
