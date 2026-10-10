'use client';

import { Mail, Send, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { RecruiterContact } from '@/lib/recruiters';
import { findRecruiters } from './recruiter-actions';

const ICON = { linkedin: UserRound, email: Mail, telegram: Send } as const;

/** "Contact the recruiter": shown only when the posting names a contact or the company's recruiter was found. */
export function PeopleSearch({ jobId }: { jobId: string }) {
  const t = useTranslations('people');
  // Keyed by job so switching vacancies never shows the previous company's people.
  const [found, setFound] = useState<{ jobId: string; people: RecruiterContact[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void findRecruiters(jobId)
      .then((people) => alive && setFound({ jobId, people }))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [jobId]);
  const people = found?.jobId === jobId ? found.people : [];
  if (people.length === 0) return null;
  return (
    <div data-testid="people-search" className="flex flex-col gap-2">
      <h4 className="eyebrow">{t('title')}</h4>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => {
          const Icon = ICON[p.kind];
          return (
            <a
              key={p.href}
              data-testid="contact-recruiter"
              href={p.href}
              target={p.kind === 'email' ? undefined : '_blank'}
              rel="noopener noreferrer"
              title={p.title}
              className="brutal-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium hover:border-brand/60 hover:bg-muted"
            >
              <Icon className="size-4 text-link" aria-hidden />
              <span>{t('contact')}</span>
              <span className="max-w-48 truncate text-muted-foreground">{p.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
