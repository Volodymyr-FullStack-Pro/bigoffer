'use client';

import type { Locale } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { saveLetterTemplate } from './profile-extras-actions';

export const DEFAULT_TEMPLATE: Record<Locale, string> = {
  en: 'Hello!\n\nI am interested in the [role] position at [company]. [Why I fit this job]\n\nI would be glad to talk.\nBest regards',
  uk: 'Вітаю!\n\nМене зацікавила позиція [роль] у [компанія]. [Чому я підходжу]\n\nБуду радий поспілкуватися.\nЗ повагою',
  ru: 'Здравствуйте!\n\nМеня заинтересовала позиция [роль] в [компания]. [Почему я подхожу]\n\nБуду рад пообщаться.\nС уважением',
};

/** A strong English template (most applications are in English). AI replaces only the [...] placeholders. */
export const RECOMMENDED_TEMPLATE = `Hi [Hiring manager name or team],

[One specific line about why this company/product — something concrete from the job post]

I'm a Full-Stack Engineer (React, Next.js, TypeScript, Node.js/NestJS) with 3+ years of commercial experience. Most relevant to this role: [2 strongest matches between my experience and the job's key requirements, with a concrete result each].

[One line about how I work: e.g. ownership, shipping fast with tests, AI-assisted workflow]

I can start immediately and I'm happy to do a short call this week.

Best regards,
[Full name]
[Phone] · [LinkedIn] · [GitHub]`;

export function LetterTemplate({ body, locale }: { body: string | null; locale: Locale }) {
  const t = useTranslations('template');
  const [text, setText] = useState(body ?? DEFAULT_TEMPLATE[locale]);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'filled'>('idle');
  const [saving, startSave] = useTransition();
  const save = () =>
    startSave(async () => {
      try {
        setStatus((await saveLetterTemplate(locale, text)) ? 'saved' : 'error');
      } catch {
        setStatus('error');
      }
    });
  return (
    <section data-testid="letter-template" className="brutal flex max-w-2xl flex-col gap-3 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      <textarea data-testid="template-body" value={text} maxLength={5000} onChange={(e) => {
          setText(e.target.value);
          setStatus('idle');
        }} aria-label={t('title')} className="brutal min-h-40 bg-card px-2 py-1 text-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="template-save" disabled={saving} onClick={save} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">{t('save')}</button>
        <button type="button" data-testid="template-recommended" onClick={() => { setText(RECOMMENDED_TEMPLATE); setStatus('filled'); }} className="brutal brutal-press px-3 py-2 text-sm font-semibold">{t('useRecommended')}</button>
        <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'error' && t('error')}{status === 'filled' && t('recommendedFilled')}</p>
      </div>
    </section>
  );
}
