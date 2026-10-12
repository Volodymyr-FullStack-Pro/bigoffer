'use client';

import { todayActions } from '@jp/core';
import { useFormatter, useTranslations } from 'next-intl';
import type { BoardCardView } from './board-types';

export function TodayActions({ cards, onPinged, onOpen, onGhosted }: {
  cards: BoardCardView[];
  onPinged: (id: string) => void;
  onOpen: (id: string) => void;
  onGhosted: (id: string) => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const actions = todayActions(cards.map((c) => ({ id: c.id, urgency: c.urgency, nextActionAt: c.nextActionAt ? new Date(c.nextActionAt) : null })));
  if (actions.length === 0) return null;
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <aside id="today-actions" data-testid="today-actions" className="scroll-mt-24 brutal flex flex-col gap-2 p-4">
      <h2 className="font-display text-lg font-semibold">{t('todayTitle', { count: actions.length })}</h2>
      <ul className="flex flex-col gap-2">
        {actions.map((a) => {
          const card = byId.get(a.id)!;
          return (
            <li key={a.id} data-testid="today-action" data-kind={a.kind} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0">
              <span>
                <span className="font-semibold">{t(`today_${a.kind}`)}</span>: {card.company} — {card.title}
                {a.at && <span suppressHydrationWarning className="font-mono text-xs"> · {format.dateTime(a.at, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
              </span>
              {a.kind === 'ping' && (
                <button type="button" onClick={() => onPinged(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionPinged')}</button>
              )}
              {a.kind === 'interview' && (
                <button type="button" onClick={() => onOpen(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionOpen')}</button>
              )}
              {a.kind === 'ghosting' && (
                <button type="button" onClick={() => onGhosted(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionGhosted')}</button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
