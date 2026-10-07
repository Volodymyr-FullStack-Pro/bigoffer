'use client';

import type { Locale } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { saveLetterTemplate } from './profile-extras-actions';

export const DEFAULT_TEMPLATE: Record<Locale, string> = {
  en: 'Hello!\n\nI am interested in the [role] position at [company]. [Why I fit this job]\n\nI would be glad to talk.\nBest regards',
  uk: 'Вітаю!\n\nМене зацікавила позиція [роль] у [компанія]. [Чому я підходжу]\n\nБуду радий поспілкуватися.\nЗ повагою',
  ru: 'Здравствуйте!\n\nМеня заинтересовала позиция [роль] в [компания]. [Почему я подхожу]\n\nБуду рад пообщаться.\nС уважением',
};

export function LetterTemplate({ body, locale }: { body: string | null; locale: Locale }) {
  const t = useTranslations('template');
  const [text, setText] = useState(body ?? DEFAULT_TEMPLATE[locale]);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  return (
    <section data-testid="letter-template" className="brutal flex max-w-2xl flex-col gap-3 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      <textarea data-testid="template-body" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} aria-label={t('title')} className="brutal min-h-40 bg-card px-2 py-1 text-sm" />
      <div className="flex items-center gap-3">
        <button type="button" data-testid="template-save" onClick={async () => setStatus((await saveLetterTemplate(locale, text)) ? 'saved' : 'error')} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('save')}</button>
        <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'error' && t('error')}</p>
      </div>
    </section>
  );
}
