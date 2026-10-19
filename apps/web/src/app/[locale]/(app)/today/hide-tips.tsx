'use client';

import type { HideSuggestion } from '@jp/core';
import { EyeOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSaveUiPrefs } from '@/lib/use-save-ui-prefs';
import { excludeWord, hideOtherStacks } from './hide-tips-actions';

/** "You keep hiding Angular (9), .NET (7)…": one click hides such jobs from now on. */
export function HideTips({ tips, dismissed }: { tips: HideSuggestion[]; dismissed: string[] }) {
  const t = useTranslations('feed');
  const save = useSaveUiPrefs(0);
  const [gone, setGone] = useState<string[]>(dismissed);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const shown = tips.filter((tip) => !gone.includes(tip.term));
  if (done) return <p role="status" data-testid="hide-tips-done" className="text-sm text-success">✓ {done}</p>;
  if (shown.length === 0) return null;
  const stacks = shown.filter((tip) => tip.kind === 'stack');
  const words = shown.filter((tip) => tip.kind === 'keyword');
  const dismiss = () => {
    const next = [...new Set([...gone, ...shown.map((tip) => tip.term)])].slice(-50);
    setGone(next);
    save({ hideTipsDismissed: next });
  };
  const run = async (action: () => Promise<boolean>, message: string) => {
    setBusy(true);
    const ok = await action().catch(() => false);
    setBusy(false);
    if (ok) setDone(message);
  };
  return (
    <aside data-testid="hide-tips" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-ai/40 bg-ai/10 px-4 py-3 text-sm">
      <EyeOff aria-hidden className="size-4 shrink-0 text-ai" />
      <span className="min-w-0 flex-1">
        {t('hideTips', { list: shown.map((tip) => `${tip.term} (${tip.count})`).join(', ') })}
      </span>
      {stacks.length > 0 && (
        <button
          type="button"
          data-testid="hide-tips-stacks"
          disabled={busy}
          onClick={() => void run(hideOtherStacks, t('hideTipsStacksDone'))}
          className="brutal-press rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background disabled:opacity-50"
        >
          {t('hideTipsStacks')}
        </button>
      )}
      {words.map((tip) => (
        <button
          key={tip.term}
          type="button"
          data-testid="hide-tips-word"
          disabled={busy}
          onClick={() => void run(() => excludeWord(tip.term), t('hideTipsWordDone', { word: tip.term }))}
          className="brutal-press rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {t('hideTipsWord', { word: tip.term })}
        </button>
      ))}
      <button type="button" data-testid="hide-tips-dismiss" onClick={dismiss} aria-label={t('hideTipsDismiss')} title={t('hideTipsDismiss')} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
        <X aria-hidden className="size-4" />
      </button>
    </aside>
  );
}
