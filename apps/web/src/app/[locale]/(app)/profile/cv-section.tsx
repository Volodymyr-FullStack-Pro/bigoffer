'use client';

import type { ParsedCv } from '@jp/ai';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { createSearchProfileFromCv, deleteCv, fillContactsFromCv, registerCv, type CvState } from './cv-actions';

const MAX_BYTES = 5 * 1024 * 1024;

const STORED_MESSAGE: Partial<Record<NonNullable<CvState['message']>, 'storedNoAi' | 'aiLimit' | 'providerLimit' | 'keyMisconfigured' | 'storedParseFailed'>> = {
  ai_unavailable: 'storedNoAi',
  ai_limit: 'aiLimit',
  ai_provider_limit: 'providerLimit',
  ai_key_invalid: 'keyMisconfigured',
  parse_failed: 'storedParseFailed',
};

export function CvSection({ cv, aiAvailable, cvLink }: { cv: { fileName: string; parsed: ParsedCv | null; parseError: string | null } | null; aiAvailable: boolean; cvLink: string | null }) {
  const t = useTranslations('cv');
  const [state, setState] = useState<CvState>({ status: 'idle' });
  const [uploading, setUploading] = useState(false);
  const [registering, startTransition] = useTransition();
  const pending = uploading || registering;
  const [filled, setFilled] = useState<boolean | null>(null);
  const parsed = cv?.parsed ?? null;
  const [deleteResult, setDeleteResult] = useState<'deleted' | 'error' | null>(null);
  const [deleting, startDelete] = useTransition();

  function onDelete() {
    if (!window.confirm(t('deleteConfirm'))) return;
    startDelete(async () => {
      try {
        setDeleteResult((await deleteCv()).ok ? 'deleted' : 'error');
      } catch {
        setDeleteResult('error');
      }
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get('cv');
    if (!(file instanceof File) || file.size === 0 || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) return setState({ status: 'invalid', message: 'not_pdf' });
    if (file.size > MAX_BYTES) return setState({ status: 'invalid', message: 'too_big' });
    setUploading(true);
    setDeleteResult(null);
    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setState({ status: 'error' });
      const path = `${user.id}/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage.from('resumes').upload(path, file, { contentType: 'application/pdf' });
      if (error) {
        const tooBig = /413|payload too large|exceeded the maximum/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`);
        return setState(tooBig ? { status: 'invalid', message: 'too_big' } : { status: 'error' });
      }
      startTransition(async () => {
        try {
          setState(await registerCv(path, file.name));
        } catch {
          setState({ status: 'error' });
        }
      });
    } catch {
      setState({ status: 'error' });
    } finally {
      setUploading(false);
    }
  }
  return (
    <section data-testid="cv-section" className="brutal flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      {!aiAvailable && <p className="text-sm text-warning">{t('aiUnavailable')}</p>}
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <input data-testid="cv-file" type="file" name="cv" accept="application/pdf" required className="text-sm" />
        <button type="submit" data-testid="cv-upload" disabled={pending} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">
          {pending ? t('uploading') : t('upload')}
        </button>
      </form>
      <p data-testid="cv-status" role="status" className="text-sm">
        {state.status === 'idle' && cv && !parsed && cv.parseError && t(STORED_MESSAGE[cv.parseError as keyof typeof STORED_MESSAGE] ?? 'storedParseFailed')}
        {state.status === 'parsed' && t('parsed')}
        {state.status === 'stored' && t(STORED_MESSAGE[state.message ?? 'parse_failed'] ?? 'storedParseFailed')}
        {state.status === 'invalid' && t(state.message === 'too_big' ? 'tooBig' : 'notPdf')}
        {state.status === 'error' && t('error')}
        {deleteResult && t(deleteResult === 'deleted' ? 'deleted' : 'deleteError')}
      </p>
      {cv && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            {cv.fileName} {cvLink && <a data-testid="cv-link" href={cvLink} target="_blank" rel="noopener" className="underline">{t('open')}</a>}
          </p>
          <div>
            <button type="button" data-testid="cv-delete" disabled={deleting} onClick={onDelete} className="brutal brutal-press px-3 py-1.5 text-sm font-semibold text-danger disabled:opacity-50">
              {t('delete')}
            </button>
          </div>
          {parsed && (
            <>
              <p data-testid="cv-headline" className="font-display text-xl font-black">
                {parsed.headline}{parsed.seniority ? ` · ${parsed.seniority}` : ''}{parsed.yearsExperience != null ? ` · ${t('years', { count: parsed.yearsExperience })}` : ''}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {parsed.skills.map((s) => <li key={s} data-testid="cv-skill" className="rounded-sm border-[1.5px] border-border px-1.5 py-0.5 font-mono text-xs">{s}</li>)}
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
