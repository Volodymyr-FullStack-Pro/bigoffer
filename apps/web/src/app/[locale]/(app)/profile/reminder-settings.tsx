'use client';

import { BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { saveReminderRules } from './reminder-actions';

const FIRST = [3, 5, 7, 10, 14];
const SECOND = [7, 10, 14, 21, 30];
const GHOST = [14, 21, 30, 45, 60];

/** When the board says "time to follow up", "overdue" and "ghosting?". */
export function ReminderSettings({ initial }: { initial: { first: number; second: number; ghost: number } }) {
  const t = useTranslations('profile');
  const [rules, setRules] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Saved as soon as a value changes; a pair where the second reminder comes first waits to be fixed.
  const change = async (next: typeof rules) => {
    setRules(next);
    if (next.second <= next.first) return setState('idle');
    setState('saving');
    setState((await saveReminderRules(next).catch(() => false)) ? 'saved' : 'error');
  };
  const field = 'brutal bg-card px-2 py-1.5 text-sm';
  const pick = (key: keyof typeof rules, options: number[], label: string, unit: 'businessDays' | 'calendarDays') => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        data-testid={`reminder-${key}`}
        value={rules[key]}
        onChange={(e) => void change({ ...rules, [key]: Number(e.target.value) })}
        className={field}
      >
        {[...new Set([...options, rules[key]])].sort((a, b) => a - b).map((n) => (
          <option key={n} value={n}>{t(unit, { count: n })}</option>
        ))}
      </select>
    </label>
  );
  const invalid = rules.second <= rules.first;
  return (
    <section data-testid="reminder-settings" className="brutal flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <BellRing aria-hidden className="mt-1 size-5 text-status-wait" />
        <div>
          <h2 className="text-lg font-semibold">{t('remindersTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('remindersHint')}</p>
        </div>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        {pick('first', FIRST, t('reminderFirst'), 'businessDays')}
        {pick('second', SECOND, t('reminderSecond'), 'businessDays')}
        {pick('ghost', GHOST, t('reminderGhost'), 'calendarDays')}
      </div>
      {invalid && <p role="alert" className="text-sm text-danger">{t('reminderOrder')}</p>}
      <p aria-live="polite" className="min-h-5 text-sm">
        {state === 'saving' && <span className="text-muted-foreground">{t('saving')}</span>}
        {state === 'saved' && <span data-testid="reminder-saved">✓ {t('saved')}</span>}
        {state === 'error' && <span role="alert" className="text-danger">{t('saveError')}</span>}
      </p>
    </section>
  );
}
