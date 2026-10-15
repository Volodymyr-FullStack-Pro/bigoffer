'use client';

import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { setFeedbackWait } from './actions';
import { fromZonedInput } from './zoned-input';

const DAY = 24 * 60 * 60 * 1000;
const PRESETS = [3, 7, 14] as const;

/**
 * "The interview is done, waiting for feedback until …": the card waits calmly until that day, then asks for a
 * reminder. Their reply or a reminder sent ends the wait.
 */
export function FeedbackWait({ applicationId, dueAt, timeZone, onChanged, onThanks }: {
  applicationId: string;
  dueAt: string | null;
  timeZone: string;
  onChanged: (patch: { feedbackDueAt: string | null; nextActionAt?: string | null }) => void;
  onThanks: () => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState('');
  const [error, setError] = useState(false);
  const [justSet, setJustSet] = useState(false);

  const save = async (due: Date | null) => {
    setError(false);
    const res = await setFeedbackWait(applicationId, due ? due.toISOString() : null).catch(() => null);
    if (!res) return setError(true);
    setPicking(false);
    setJustSet(due !== null);
    onChanged(res);
  };

  // A picked day means the end of that day in the user's zone.
  const endOfDay = (value: string): Date | null => {
    const iso = fromZonedInput(`${value}T20:00`, timeZone);
    return iso ? new Date(iso) : null;
  };

  if (dueAt && !picking) {
    const due = new Date(dueAt);
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY);
    return (
      <div data-testid="feedback-wait" className="brutal flex flex-col gap-2 border-l-[6px] p-3 text-sm" style={{ borderLeftColor: '#F59E0B' }}>
        <p>
          ⏳ <span className="font-semibold">{t('feedbackWaiting')}</span>{' '}
          <span suppressHydrationWarning data-testid="feedback-due">{format.dateTime(due, { timeZone, day: 'numeric', month: 'long' })}</span>
          <span className="text-muted-foreground"> · {daysLeft > 0 ? t('feedbackDaysLeft', { count: daysLeft }) : t('feedbackOverdue')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {justSet && (
            <button type="button" data-testid="feedback-thanks" onClick={onThanks} className="brutal brutal-press bg-ai px-3 py-1 text-xs font-semibold text-ai-foreground">
              ✍ {t('feedbackThanks')}
            </button>
          )}
          <button type="button" onClick={() => setPicking(true)} className="brutal brutal-press px-3 py-1 text-xs">{t('feedbackChange')}</button>
          <button type="button" data-testid="feedback-stop" onClick={() => void save(null)} className="text-xs underline">{t('feedbackStop')}</button>
        </div>
        {error && <p role="alert" className="text-danger">{t('saveError')}</p>}
      </div>
    );
  }

  if (!picking) {
    return (
      <button type="button" data-testid="feedback-start" onClick={() => setPicking(true)} className="brutal brutal-press self-start px-3 py-1.5 text-sm font-semibold">
        ✓ {t('feedbackStart')}
      </button>
    );
  }

  return (
    <div data-testid="feedback-picker" className="brutal flex flex-col gap-2 p-3 text-sm">
      <p className="font-semibold">{t('feedbackWhen')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            data-testid="feedback-preset"
            data-days={days}
            onClick={() => void save(new Date(now.getTime() + days * DAY))}
            className="brutal brutal-press px-3 py-1 text-xs font-semibold"
          >
            {t('feedbackPreset', { count: days })}
          </button>
        ))}
        <input data-testid="feedback-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('feedbackDate')} className="brutal bg-card px-2 py-1 text-xs" />
        <button type="button" data-testid="feedback-date-save" disabled={!date} onClick={() => { const due = endOfDay(date); if (due) void save(due); }} className="brutal brutal-press bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground disabled:opacity-50">
          {t('save')}
        </button>
        <button type="button" onClick={() => setPicking(false)} className="text-xs underline">{t('feedbackCancel')}</button>
      </div>
      <p className="text-xs text-muted-foreground">{t('feedbackHint')}</p>
      {error && <p role="alert" className="text-danger">{t('saveError')}</p>}
    </div>
  );
}
