'use client';

import { useTranslations } from 'next-intl';
import { canSearchPeople, peopleSearchLinks } from '@/lib/people-search';

export function PeopleSearch({ company, isPlaceholder }: { company: string | null | undefined; isPlaceholder: boolean }) {
  const t = useTranslations('people');
  if (!company || !canSearchPeople(company, isPlaceholder)) return null;
  const links = peopleSearchLinks(company.trim());
  const link = 'rounded-sm border-[1.5px] border-border px-2 py-0.5 font-mono text-xs hover:bg-muted';
  return (
    <div data-testid="people-search" className="flex flex-col gap-1">
      <h4 className="font-mono text-xs">{t('title')}</h4>
      <div className="flex flex-wrap gap-1.5">
        <a data-testid="people-recruiters" href={links.recruiters} target="_blank" rel="noopener noreferrer" className={link}>{t('recruiters')}</a>
        <a data-testid="people-engineers" href={links.engineers} target="_blank" rel="noopener noreferrer" className={link}>{t('engineers')}</a>
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
    </div>
  );
}
