'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GenieAvatar } from '@/components/genie/genie-avatar';
import type { UiPrefs } from '@/lib/ui-prefs';
import { useSaveUiPrefs } from '@/lib/use-save-ui-prefs';

const MODES = ['on', 'quiet', 'off'] as const;

/** Offer Genie mode and the daily application goal, kept in ui_prefs. */
export function GenieSettings({ initial }: { initial: NonNullable<UiPrefs['genie']> }) {
  const t = useTranslations('genie');
  // An explicit setting is written at once: a debounced write was lost when the user left the page right away.
  const save = useSaveUiPrefs(0);
  const [mode, setMode] = useState(initial.mode ?? 'on');
  const [goal, setGoal] = useState(initial.goal ?? 5);
  return (
    <section data-testid="genie-settings" className="brutal flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <GenieAvatar mood="happy" size={40} />
        <div>
          <h2 className="text-lg font-semibold">{t('settingsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('settingsHint')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div role="radiogroup" aria-label={t('settingsTitle')} className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              data-testid={`genie-mode-${m}`}
              onClick={() => {
                setMode(m);
                save({ genie: { mode: m } });
              }}
              className={`brutal-press rounded-full border px-3.5 py-1.5 text-sm font-medium ${mode === m ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-muted'}`}
            >
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('goalLabel')}
          <input
            type="number"
            min={1}
            max={50}
            value={goal}
            data-testid="genie-goal-input"
            onChange={(e) => {
              const v = Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1)));
              setGoal(v);
              save({ genie: { goal: v } });
            }}
            className="w-24 rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground"
          />
        </label>
      </div>
    </section>
  );
}
