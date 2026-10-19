'use client';

import { todayActions } from '@jp/core';
import { ChevronDown } from 'lucide-react';
import { useFormatter, useNow, useTimeZone, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { JoinMeeting } from './join-meeting';
import type { BoardCardView } from './board-types';

const noopSubscribe = () => () => undefined;
function readTodayOpen(): boolean {
  try {
    return localStorage.getItem('bo.todayOpen') !== '0';
  } catch {
    return true;
  }
}

/** More plain follow-ups than this fold into one line: a batch of applications comes due on the same day. */
const FOLD_PINGS = 3;

export function TodayActions({ cards, onPinged, onPingedMany, onOpen, onGhosted, onGhostedMany }: {
  cards: BoardCardView[];
  onPinged: (id: string) => void;
  onPingedMany: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onGhosted: (id: string) => void;
  /** Closes every listed card as "no answer" at once. */
  onGhostedMany: (ids: string[]) => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const [pingsOpen, setPingsOpen] = useState(false);
  const [ghostsOpen, setGhostsOpen] = useState(false);
  // Folded or open is remembered per browser: a long list should not push the board down every visit.
  const stored = useSyncExternalStore(noopSubscribe, readTodayOpen, () => true);
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? stored;
  const toggle = () => {
    const next = !open;
    setOverride(next);
    try {
      localStorage.setItem('bo.todayOpen', next ? '1' : '0');
    } catch {
      // storage blocked: only this visit remembers it
    }
  };
  const now = useNow();
  const timeZone = useTimeZone() ?? 'UTC';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const tomorrow = day(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  // "today, 18:00" / "tomorrow, 18:00" reads at a glance; a later date keeps the date.
  const when = (at: Date) => {
    const time = format.dateTime(at, { timeZone, hour: '2-digit', minute: '2-digit' });
    if (day(at) === day(now)) return t('todayAt', { time });
    if (day(at) === tomorrow) return t('tomorrowAt', { time });
    return format.dateTime(at, { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const actions = todayActions(cards.map((c) => ({ id: c.id, urgency: c.urgency, nextActionAt: c.nextActionAt ? new Date(c.nextActionAt) : null })));
  if (actions.length === 0) return null;
  const byId = new Map(cards.map((c) => [c.id, c]));
  // An interview tomorrow is not a task for today: it goes under "Coming up" and does not count in today's number.
  const dueToday = actions.filter((a) => a.kind !== 'interview' || !a.at || day(a.at) <= day(now));
  const comingUp = actions.filter((a) => !dueToday.includes(a));
  const pings = dueToday.filter((a) => a.kind === 'ping');
  const foldPings = pings.length > FOLD_PINGS;
  // Long silences pile up the same way: one group with "close all as no answer".
  const ghosts = dueToday.filter((a) => a.kind === 'ghosting');
  const foldGhosts = ghosts.length > FOLD_PINGS;
  const others = dueToday.filter((a) => !(foldPings && a.kind === 'ping') && !(foldGhosts && a.kind === 'ghosting'));
  const todayCount = others.length + (foldPings ? 1 : 0) + (foldGhosts ? 1 : 0);
  const item = (a: (typeof actions)[number]) => {
    const card = byId.get(a.id)!;
    return (
      <li key={a.id} data-testid="today-action" data-kind={a.kind} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0">
        <span>
          <span className="font-semibold">{t(`today_${a.kind}`)}</span>: {card.company} — {card.title}
          {a.at && <span data-testid="today-when" suppressHydrationWarning className="tabular-nums text-xs font-semibold"> · {when(a.at)}</span>}
        </span>
        {a.kind === 'interview' && card.meetingUrl && !card.feedbackDueAt && <JoinMeeting url={card.meetingUrl} label={t('joinMeeting')} testId="today-join" />}
        {(a.kind === 'ping' || a.kind === 'feedback') && (
          <button type="button" onClick={() => onPinged(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionPinged')}</button>
        )}
        {(a.kind === 'interview' || a.kind === 'answer' || a.kind === 'status') && (
          <button type="button" onClick={() => onOpen(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionOpen')}</button>
        )}
        {a.kind === 'ghosting' && (
          <button type="button" onClick={() => onGhosted(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionGhosted')}</button>
        )}
      </li>
    );
  };
  const group = (g: { id: string; list: typeof actions; open: boolean; setOpen: (fn: (v: boolean) => boolean) => void; title: string; all: string; confirm: string; onAll: () => void }) => (
    <li data-testid={`today-${g.id}`} className="flex flex-col gap-2 border-b border-border pb-2 last:border-b-0">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-testid={`today-${g.id}-toggle`}
          aria-expanded={g.open}
          onClick={() => g.setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-left font-semibold"
        >
          {g.title}
          <span className="text-sm font-normal text-muted-foreground">· {g.open ? t('pingGroupHide') : t('pingGroupShow')}</span>
          <ChevronDown aria-hidden className={`size-4 transition-transform ${g.open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          data-testid={`today-${g.id}-all`}
          onClick={() => { if (window.confirm(g.confirm)) g.onAll(); }}
          className="brutal brutal-press px-3 py-1 text-sm font-semibold"
        >
          {g.all}
        </button>
      </span>
      {g.open && <ul className="flex flex-col gap-2 pl-3">{g.list.map(item)}</ul>}
    </li>
  );
  return (
    <aside id="today-actions" data-testid="today-actions" className="scroll-mt-24 brutal flex flex-col gap-2 p-4">
      <button type="button" data-testid="today-toggle" aria-expanded={open} onClick={toggle} className="flex items-center justify-between gap-2 text-left">
        <h2 data-testid="today-title" className="font-display text-lg font-semibold">
          {todayCount > 0 ? t('todayTitle', { count: todayCount }) : t('todayNothing')}
        </h2>
        <ChevronDown aria-hidden className={`size-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && todayCount > 0 && (
        <ul className="flex flex-col gap-2">
          {others.map(item)}
          {foldPings && group({ id: 'pings', list: pings, open: pingsOpen, setOpen: setPingsOpen, title: t('pingGroup', { count: pings.length }), all: t('pingAll'), confirm: t('pingAllConfirm', { count: pings.length }), onAll: () => onPingedMany(pings.map((a) => a.id)) })}
          {foldGhosts && group({ id: 'ghosts', list: ghosts, open: ghostsOpen, setOpen: setGhostsOpen, title: t('ghostGroup', { count: ghosts.length }), all: t('ghostAll'), confirm: t('ghostAllConfirm', { count: ghosts.length }), onAll: () => onGhostedMany(ghosts.map((a) => a.id)) })}
        </ul>
      )}
      {open && comingUp.length > 0 && (
        <>
          <h3 className="mt-1 tabular-nums text-xs text-muted-foreground">{t('comingUp')}</h3>
          <ul data-testid="coming-up" className="flex flex-col gap-2">{comingUp.map(item)}</ul>
        </>
      )}
    </aside>
  );
}
