'use client';

import { Check, Copy, ExternalLink, Mail, Send, Sparkles, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { RankedContact } from '@/lib/recruiters';
import { findRecruiters, recruiterNote } from './recruiter-actions';

const ICON = { linkedin: UserRound, email: Mail, telegram: Send } as const;
type Lang = 'auto' | 'en' | 'uk' | 'ru';

/** A ready first message to one person, with the CV link and contacts at the end; copy, then open their profile. */
function NoteComposer({ jobId, contact }: { jobId: string; contact: RankedContact }) {
  const t = useTranslations('people');
  const [lang, setLang] = useState<Lang>('auto');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const generate = async () => {
    setState('loading');
    const res = await recruiterNote(jobId, { kind: contact.kind, label: contact.label }, lang).catch(() => ({ ok: false as const, error: 'failed' as const }));
    if (res.ok) {
      setSubject(res.subject);
      setBody(res.body);
      setState('idle');
      setCopied(false);
    } else {
      setError(res.error);
      setState('error');
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div data-testid="recruiter-note" className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('lang')} className="h-8 rounded-lg border border-border bg-card px-2 text-xs">
          {(['auto', 'uk', 'en', 'ru'] as const).map((l) => <option key={l} value={l}>{t(`lang_${l}`)}</option>)}
        </select>
        <button type="button" data-testid="recruiter-note-generate" disabled={state === 'loading'} onClick={() => void generate()} className="brutal-press inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background disabled:opacity-60">
          <Sparkles className="size-3.5" aria-hidden />
          {state === 'loading' ? t('generating') : body ? t('regenerate') : t('generate')}
        </button>
      </div>
      {state === 'error' && <p role="alert" className="text-xs text-danger">{t(`err_${error ?? 'failed'}` as 'err_failed')}</p>}
      {body && (
        <>
          {subject && <p className="text-xs"><span className="text-muted-foreground">{t('subject')}:</span> {subject}</p>}
          <textarea data-testid="recruiter-note-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40 rounded-lg border border-border bg-card px-2.5 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="recruiter-note-copy" onClick={() => void copy()} className="brutal-press inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
              {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied ? t('copied') : t('copy')}
            </button>
            <a href={contact.href} target={contact.kind === 'email' ? undefined : '_blank'} rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted">
              <ExternalLink className="size-3.5" aria-hidden />
              {t(contact.kind === 'email' ? 'openEmail' : contact.kind === 'telegram' ? 'openTelegram' : 'openProfile')}
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('noteHint')}</p>
        </>
      )}
    </div>
  );
}

/**
 * "Contact the recruiter": the posting's own contacts and the company's recruiters, best first. Each one has a
 * ready-made message (with the CV link and contacts). Hidden when nobody is found.
 */
export function PeopleSearch({ jobId }: { jobId: string }) {
  const t = useTranslations('people');
  // Keyed by job so switching vacancies never shows the previous company's people.
  const [found, setFound] = useState<{ jobId: string; people: RankedContact[] } | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
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
      <ul className="flex flex-col gap-2">
        {people.map((p) => {
          const Icon = ICON[p.kind];
          return (
            <li key={p.href} data-testid="contact-recruiter-row" data-best={p.best || undefined} className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${p.best ? 'border-brand/60 bg-brand/[0.06]' : 'border-border'} ${p.current ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Icon className="size-4 shrink-0 text-link" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {p.label}
                    {p.best && <span data-testid="recruiter-best" className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-foreground">★ {t('best')}</span>}
                  </span>
                  {p.title && <span className="truncate text-xs text-muted-foreground">{p.title}</span>}
                  {!p.current && <span className="text-[11px] text-warning">{t('maybePast')}</span>}
                </span>
                <a data-testid="contact-recruiter" href={p.href} target={p.kind === 'email' ? undefined : '_blank'} rel="noopener noreferrer" className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted">
                  {t('contact')}
                </a>
                <button type="button" data-testid="recruiter-write" aria-expanded={writing === p.href} onClick={() => setWriting((w) => (w === p.href ? null : p.href))} className="inline-flex items-center gap-1 rounded-full border border-brand/60 bg-brand/15 px-3 py-1 text-xs font-semibold text-link hover:bg-brand/25">
                  ✍️ {t('write')}
                </button>
              </div>
              {writing === p.href && <NoteComposer jobId={jobId} contact={p} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
