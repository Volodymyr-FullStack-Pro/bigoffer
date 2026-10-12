'use client';

import { Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { CardLabels } from './domain-badges';

const KEYS: (keyof CardLabels)[] = ['military', 'reservation', 'domains', 'testTask', 'partTime', 'urgent'];

/** "Labels" menu next to the feed filters: pick which label groups the cards show. */
export function LabelsMenu({ value, onChange }: { value: CardLabels; onChange: (next: CardLabels) => void }) {
  const t = useTranslations('feed');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={box} className="relative flex flex-col gap-1 font-mono text-xs">
      <span>{t('labelsMenu')}</span>
      <button
        type="button"
        data-testid="labels-menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="brutal inline-flex items-center gap-1.5 bg-card px-2 py-1 font-sans text-sm"
      >
        <Tags className="size-4" aria-hidden />
        {KEYS.filter((k) => value[k]).length}/{KEYS.length}
      </button>
      {open && (
        <div role="group" aria-label={t('labelsTitle')} className="absolute top-full right-0 z-30 mt-1 flex w-64 flex-col gap-1.5 rounded-xl border border-border bg-card p-3 font-sans shadow-xl">
          <p className="text-xs font-semibold text-muted-foreground">{t('labelsTitle')}</p>
          {KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" data-testid={`label-toggle-${k}`} checked={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} className="size-4" />
              {t(`label_${k}`)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
