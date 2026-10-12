'use client';

import type { JobDomain } from '@jp/core';
import { useTranslations } from 'next-intl';

/** Small field labels; army service stands out in red so nobody applies by accident. */
export function DomainBadges({ domains, detailed = false }: { domains: JobDomain[]; detailed?: boolean }) {
  const t = useTranslations('feed');
  if (domains.length === 0) return null;
  const army = domains.includes('military');
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-1" data-testid="job-domains">
        {domains.map((d) => (
          <span
            key={d}
            data-testid={`domain-${d}`}
            className={
              d === 'military'
                ? 'rounded-full border border-danger/60 bg-danger/15 px-2 py-0.5 text-[11px] font-bold text-danger'
                : 'rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
            }
          >
            {t(`domain_${d}`)}
          </span>
        ))}
      </span>
      {detailed && army && <span className="text-xs text-danger">{t('domain_militaryHint')}</span>}
    </span>
  );
}
