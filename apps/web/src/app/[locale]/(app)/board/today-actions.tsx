'use client';

import { todayActions } from '@jp/core';
import { useFormatter, useNow, useTimeZone, useTranslations } from 'next-intl';
import { JoinMeeting } from './join-meeting';
import type { BoardCardView } from './board-types';

export function TodayActions({ cards, onPinged, onOpen, onGhosted }: {
  cards: BoardCardView[];
  onPinged: (id: string) => void;
  onOpen: (id: string) => void;
  onGhosted: (id: string) => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
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
  const item = (a: (typeof actions)[number]) => {
    const card = byId.get(a.id)!;
    return (
      <li key={a.id} data-testid="today-action" data-kind={a.kind} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0">
        <span>
          <span className="font-semibold">{t(`today_${a.kind}`)}</span>: {card.company} — {card.title}
          {a.at && <span data-testid="today-when" suppressHydrationWarning className="font-mono text-xs font-semibold"> · {when(a.at)}</span>}
        </span>
        {a.kind === 'interview' && card.meetingUrl && <JoinMeeting url={card.meetingUrl} label={t('joinMeeting')} testId="today-join" />}
        {a.kind === 'ping' && (
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
  return (
    <aside id="today-actions" data-testid="today-actions" className="scroll-mt-24 brutal flex flex-col gap-2 p-4">
      <h2 data-testid="today-title" className="font-display text-lg font-semibold">
        {dueToday.length > 0 ? t('todayTitle', { count: dueToday.length }) : t('todayNothing')}
      </h2>
      {dueToday.length > 0 && <ul className="flex flex-col gap-2">{dueToday.map(item)}</ul>}
      {comingUp.length > 0 && (
        <>
          <h3 className="mt-1 font-mono text-xs text-muted-foreground">{t('comingUp')}</h3>
          <ul data-testid="coming-up" className="flex flex-col gap-2">{comingUp.map(item)}</ul>
        </>
      )}
    </aside>
  );
}
