'use client';

import type { ParsedCv } from '@jp/ai';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { createSearchProfileFromCv, fillContactsFromCv, uploadCv, type CvState } from './cv-actions';

export function CvSection({ cv, aiAvailable, cvLink }: { cv: { fileName: string; parsed: ParsedCv | null; parseError: string | null } | null; aiAvailable: boolean; cvLink: string | null }) {
  const t = useTranslations('cv');
  const [state, action, pending] = useActionState<CvState, FormData>(uploadCv, { status: 'idle' });
  const [filled, setFilled] = useState<boolean | null>(null);
  const parsed = cv?.parsed ?? null;
  return (
    <section data-testid="cv-section" className="brutal flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      {!aiAvailable && <p className="text-sm text-warning">{t('aiUnavailable')}</p>}
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input data-testid="cv-file" type="file" name="cv" accept="application/pdf" required className="text-sm" />
        <button type="submit" data-testid="cv-upload" disabled={pending} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">
          {pending ? t('uploading') : t('upload')}
        </button>
      </form>
      <p data-testid="cv-status" role="status" className="text-sm">
        {state.status === 'parsed' && t('parsed')}
        {state.status === 'stored' && t(state.message === 'ai_unavailable' ? 'storedNoAi' : state.message === 'ai_limit' ? 'aiLimit' : 'storedParseFailed')}
        {state.status === 'invalid' && t(state.message === 'too_big' ? 'tooBig' : 'notPdf')}
        {state.status === 'error' && t('error')}
      </p>
      {cv && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            {cv.fileName} {cvLink && <a data-testid="cv-link" href={cvLink} target="_blank" rel="noopener" className="underline">{t('open')}</a>}
          </p>
          {parsed && (
            <>
              <p data-testid="cv-headline" className="font-display text-xl font-black">
                {parsed.headline}{parsed.seniority ? ` · ${parsed.seniority}` : ''}{parsed.yearsExperience != null ? ` · ${t('years', { count: parsed.yearsExperience })}` : ''}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {parsed.skills.map((s) => <li key={s} data-testid="cv-skill" className="rounded-sm border-2 border-border px-1.5 py-0.5 font-mono text-xs">{s}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <form action={createSearchProfileFromCv}>
                  <button type="submit" data-testid="cv-create-search" className="brutal brutal-press px-3 py-1.5 text-sm font-semibold">{t('createSearch')}</button>
                </form>
                <button type="button" data-testid="cv-fill-contacts" onClick={async () => {
                    try {
                      setFilled(await fillContactsFromCv());
                    } catch {
                      setFilled(false);
                    }
                  }} className="brutal brutal-press px-3 py-1.5 text-sm font-semibold">
                  {t('fillContacts')}
                </button>
                {filled !== null && <span role="status" className="self-center text-sm">{t(filled ? 'contactsFilled' : 'error')}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
