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
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const field = 'brutal bg-card px-2 py-1.5 text-sm';
  const pick = (key: keyof typeof rules, options: number[], label: string, unit: 'businessDays' | 'calendarDays') => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        data-testid={`reminder-${key}`}
        value={rules[key]}
        onChange={(e) => { setRules((r) => ({ ...r, [key]: Number(e.target.value) })); setState('idle'); }}
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
    <section data-testid="reminder-settings" className="brutal flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <BellRing aria-hidden className="mt-1 size-5 text-status-wait" />
        <div>
          <h2 className="text-lg font-semibold">{t('remindersTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('remindersHint')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {pick('first', FIRST, t('reminderFirst'), 'businessDays')}
        {pick('second', SECOND, t('reminderSecond'), 'businessDays')}
        {pick('ghost', GHOST, t('reminderGhost'), 'calendarDays')}
      </div>
      {invalid && <p role="alert" className="text-sm text-danger">{t('reminderOrder')}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="reminder-save"
          disabled={invalid}
          onClick={async () => setState((await saveReminderRules(rules).catch(() => false)) ? 'saved' : 'error')}
          className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50"
        >
          {t('save')}
        </button>
        {state === 'saved' && <span data-testid="reminder-saved" className="text-sm">✓ {t('saved')}</span>}
        {state === 'error' && <span role="alert" className="text-sm text-danger">{t('saveError')}</span>}
      </div>
    </section>
  );
}
