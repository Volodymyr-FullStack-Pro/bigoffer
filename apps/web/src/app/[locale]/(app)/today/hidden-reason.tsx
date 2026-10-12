'use client';

import { useTranslations } from 'next-intl';

const KNOWN = ['seniority', 'role', 'format', 'region'] as const;

/** Why the profile rules hid a job: a level, role, format or region rule, or an exclude word. */
export function HiddenReason({ reason }: { reason: string }) {
  const t = useTranslations('feed');
  const known = (KNOWN as readonly string[]).includes(reason);
  return (
    <span data-testid="hidden-reason" className="self-start rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
      {known ? t(`reason_${reason as (typeof KNOWN)[number]}`) : t('reason_keyword', { word: reason })}
    </span>
  );
}
