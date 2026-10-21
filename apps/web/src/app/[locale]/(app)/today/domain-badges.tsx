'use client';

import type { JobDomain, JobPerk } from '@jp/core';
import { useTranslations } from 'next-intl';
import { createContext, useContext } from 'react';
import type { UiPrefs } from '@/lib/ui-prefs';

export type CardLabels = Required<NonNullable<UiPrefs['cardLabels']>>;
export const ALL_LABELS: CardLabels = { domains: true, military: true, reservation: true, testTask: true, partTime: true, urgent: true };

/** Which label groups the user chose to see on job cards (Feed provides it; everything on by default). */
export const CardLabelsContext = createContext<CardLabels>(ALL_LABELS);

const PERK_STYLE: Record<JobPerk, string> = {
  reservation: 'border-success/50 bg-success/15 text-success font-bold',
  testTask: 'border-warning/50 bg-warning/10 text-warning',
  partTime: 'border-border bg-muted/60 text-foreground',
  urgent: 'border-warning/60 bg-warning/15 text-warning font-bold',
};

/** Field and condition labels; army service in red, reservation in green, per the user's label choice. */
export function DomainBadges({ domains, perks = [], detailed = false }: { domains: JobDomain[]; perks?: JobPerk[]; detailed?: boolean }) {
  const t = useTranslations('feed');
  const show = useContext(CardLabelsContext);
  const army = show.military && domains.includes('military');
  const fields = show.domains ? domains.filter((d) => d !== 'military') : [];
  const conditions = perks.filter((p) => show[p]);
  if (!army && fields.length === 0 && conditions.length === 0) return null;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-1" data-testid="job-domains">
        {army && (
          <span data-testid="domain-military" className="rounded-full border border-danger/60 bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
            {t('domain_military')}
          </span>
        )}
        {conditions.map((p) => (
          <span key={p} data-testid={`perk-${p}`} className={`rounded-full border px-2 py-0.5 text-[11px] ${PERK_STYLE[p]}`}>
            {t(`perk_${p}`)}
          </span>
        ))}
        {fields.map((d) => (
          <span key={d} data-testid={`domain-${d}`} className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {t(`domain_${d}`)}
          </span>
        ))}
      </span>
      {detailed && army && <span className="text-xs text-danger">{t('domain_militaryHint')}</span>}
    </span>
  );
}
