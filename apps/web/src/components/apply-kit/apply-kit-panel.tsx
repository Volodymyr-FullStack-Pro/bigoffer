'use client';

import { pill } from '@/components/ui/pill';
import { Check, Copy, Sparkles } from 'lucide-react';
import { textLang } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { saveBankAnswer } from '@/app/[locale]/(app)/profile/profile-extras-actions';
import { tellGenie } from '@/lib/genie/events';
import { downloadLetter } from '@/lib/letter-file';
import { useSaveUiPrefs } from '@/lib/use-save-ui-prefs';
import { answerFormQuestions, type FormAnswer, generateKit, getApplyKitData, type KitData, type KitError, markAppliedFromKit, saveKitLetter, type StoredKit } from './actions';
import { ContactChips } from './contact-chips';
import { PeopleSearch } from './people-search';

type Lang = 'auto' | 'en' | 'uk' | 'ru';
type Tone = 'default' | 'shorter' | 'formal';

function CopyIcon({ done }: { done: boolean }) {
  return done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />;
}

export function ApplyKitPanel({ jobId, onApplied, hidePeopleSearch }: { jobId: string; locale: 'en' | 'uk' | 'ru'; hidePeopleSearch?: boolean; onApplied?: (r: { columnId: string; rank: string }) => void }) {
  const t = useTranslations('kit');
  const [data, setData] = useState<KitData | null>(null);
  const [kit, setKit] = useState<StoredKit | null>(null);
  const [lang, setLang] = useState<Lang>('auto');
  const saveUiPrefs = useSaveUiPrefs();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<KitError | null>(null);
  const [formText, setFormText] = useState('');
  const [answers, setAnswers] = useState<FormAnswer[]>([]);
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [lastCopied, setLastCopied] = useState<'full' | 'short' | null>(null);
  const [savedKey, setSavedKey] = useState<number | null>(null);
  const [awaitingReturn, setAwaitingReturn] = useState<'click' | 'hidden' | null>(null);
  const [askApplied, setAskApplied] = useState(false);
  const [appliedState, setAppliedState] = useState<'idle' | 'done' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    void getApplyKitData(jobId).then((d) => {
      if (!alive || !d) return;
      setData(d);
      setLang(d.kitLang);
      setKit(d.kit);
      setLetter(d.kit?.coverLetter ?? '');
      setAnswers(d.formAnswers);
    });
    return () => { alive = false; };
  }, [jobId]);

  useEffect(() => {
    if (!awaitingReturn) return;
    // The prompt only appears after the user actually left the page and came back.
    const onVisible = () => {
      if (document.visibilityState === 'hidden') setAwaitingReturn('hidden');
      else if (awaitingReturn === 'hidden') {
        setAwaitingReturn(null);
        setAskApplied(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [awaitingReturn]);

  const run = async (tone: Tone) => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateKit(jobId, { lang, tone });
      if (res.ok) {
        setKit(res.kit);
        tellGenie({ type: 'letter' });
        setLetter(res.kit.coverLetter);
        setCopied(null);
      } else setError(res.error);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  };

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(key);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    if (key === 'letter') {
      setLastCopied('full');
      // Keep the user's edits so they survive a reload.
      void saveKitLetter(jobId, letter).catch(() => undefined);
    } else if (key === 'short') setLastCopied('short');
  };

  const confirmApplied = async (yes: boolean) => {
    setAskApplied(false);
    if (!yes) return;
    const kind = lastCopied ?? 'none';
    const text = kind === 'full' ? letter : kind === 'short' ? (kit?.shortMessage ?? null) : null;
    try {
      const res = await markAppliedFromKit(jobId, kind, text);
      setAppliedState(res.ok ? 'done' : 'error');
      if (res.ok) tellGenie({ type: 'applied' });
      if (res.ok) onApplied?.({ columnId: res.columnId, rank: res.rank });
    } catch {
      setAppliedState('error');
    }
  };

  if (!data) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const field = 'rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground';
  const { primary, accent, quiet } = pill;

  return (
    <section data-testid="apply-kit" aria-label={t('title')} className="flex flex-col gap-4 border-t border-border pt-4">
      {!data.aiAvailable && <p data-testid="kit-error" className="text-sm text-warning">{t('err_ai_unavailable')}</p>}
      {data.aiAvailable && !data.hasCv && <p data-testid="kit-error" className="text-sm text-warning">{t('err_no_cv')}</p>}
      {error && <p data-testid="kit-error" role="alert" className="text-sm text-danger">{t(`err_${error}`)}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {t('language')}
          <select value={lang} onChange={(e) => { const v = e.target.value as Lang; setLang(v); saveUiPrefs({ kitLang: v }); }} className="h-8 rounded-full border border-border bg-card px-3 text-[13px] text-foreground">
            {(['auto', 'en', 'uk', 'ru'] as const).map((l) => <option key={l} value={l}>{t(`lang_${l}`)}</option>)}
          </select>
        </label>
        <button type="button" data-testid="kit-generate" disabled={loading || !data.aiAvailable || !data.hasCv} onClick={() => void run('default')} className={primary}>
          <Sparkles className="size-4" aria-hidden />
          {loading ? t('generating') : kit ? t('regenerate') : t('generate')}
        </button>
        {kit && (
          <>
            <button type="button" disabled={loading} onClick={() => void run('shorter')} className={quiet}>{t('shorter')}</button>
            <button type="button" disabled={loading} onClick={() => void run('formal')} className={quiet}>{t('formal')}</button>
          </>
        )}
      </div>

      {kit && (
        <>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t('letter')}
            <textarea data-testid="kit-letter" value={letter} maxLength={6000} onChange={(e) => setLetter(e.target.value)} className={`${field} min-h-40 font-sans`} />
          </label>
          {/* Copy, then go straight to the posting to paste it. */}
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="kit-copy-letter" onClick={() => void copy('letter', letter)} className={accent}>
              <CopyIcon done={copied === 'letter'} />
              {copied === 'letter' ? t('copied') : t('copyLetter')}
            </button>
            <button type="button" data-testid="kit-download-docx" onClick={() => void downloadLetter(letter, `${t('fileName')} - ${data.company}`, 'docx')} className={quiet}>
              {t('downloadDocx')}
            </button>
            <button type="button" data-testid="kit-download-txt" onClick={() => void downloadLetter(letter, `${t('fileName')} - ${data.company}`, 'txt')} className={quiet}>
              .txt
            </button>
            {data.jobUrl && (
              <a href={data.jobUrl} target="_blank" rel="noopener" data-testid="kit-open-job" onClick={() => setAwaitingReturn('click')} className={quiet}>
                {t('apply')} ↗
              </a>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground">{t('requirements')}</h4>
            <ul className="flex flex-col gap-1 text-sm">
              {kit.requirements.map((r, i) => (
                <li key={`${i}-${r.text}`} data-testid="kit-requirement" data-status={r.status}>
                  {r.status === 'met' ? '✓' : r.status === 'missing' ? '✗' : '?'} {r.text}
                </li>
              ))}
            </ul>
            {kit.redFlags.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
                {kit.redFlags.map((f, i) => <li key={`${i}-${f}`} data-testid="kit-red-flag">⚑ {f}</li>)}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold text-muted-foreground">{t('short')}</h4>
            <p data-testid="kit-short" className="brutal p-2 text-sm">{kit.shortMessage}</p>
            <button type="button" data-testid="kit-copy-short" onClick={() => void copy('short', kit.shortMessage)} className={`${quiet} self-start`}>
              <CopyIcon done={copied === 'short'} />
              {copied === 'short' ? t('copied') : t('copyShort')}
            </button>
          </div>
          {kit.salaryHint && <p data-testid="kit-salary" className="border-l-4 border-warning pl-3 text-sm">💰 {kit.salaryHint}</p>}
        </>
      )}

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-semibold text-muted-foreground">{t('contacts')}</h4>
        <ContactChips contacts={data.contacts} cvLink={data.cvLink} />
      </div>

      {!hidePeopleSearch && <PeopleSearch jobId={jobId} />}

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {t('formQuestions')}
          <textarea data-testid="kit-form-input" value={formText} maxLength={10000} onChange={(e) => setFormText(e.target.value)} placeholder={t('formPlaceholder')} className={`${field} min-h-20 font-sans`} />
        </label>
        <button
          type="button"
          data-testid="kit-form-submit"
          disabled={!formText.trim() || loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              const res = await answerFormQuestions(jobId, formText);
              if (res.ok) {
                // New answers: nothing of them has been copied or saved yet.
                setAnswers(res.answers);
                setCopied(null);
                setSavedKey(null);
              }
              else setError(res.error);
            } catch {
              setError('failed');
            } finally {
              setLoading(false);
            }
          }}
          className={`${primary} self-start`}
        >
          <Sparkles className="size-4" aria-hidden />
          {t('answerForm')}
        </button>
        {answers.map((a, i) => (
          <div key={`${i}-${a.question}`} data-testid="kit-answer" data-from-bank={a.fromBank} className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3">
            <p className="text-sm font-semibold">{a.question}{a.fromBank && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{t('fromBank')}</span>}</p>
            <textarea value={a.answer} onChange={(e) => setAnswers((list) => list.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} className={`${field} min-h-14`} aria-label={a.question} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="kit-copy-answer" onClick={() => void copy(`a${i}`, a.answer)} className={`${quiet} ${copied === `a${i}` ? 'border-brand/60 text-link' : ''}`}>
                <CopyIcon done={copied === `a${i}`} />
                {copied === `a${i}` ? t('copied') : t('copy')}
              </button>
              <button type="button" data-testid="kit-save-answer" onClick={async () => {
                const res = await saveBankAnswer({ key: null, question: a.question, answer: a.answer, locale: textLang(a.question) }).catch(() => ({ ok: false }));
                setSavedKey(res.ok ? i : null);
              }} className={`${quiet} border-transparent text-muted-foreground hover:text-foreground`}>{t('saveToBank')}</button>
              {savedKey === i && <span role="status" className="text-xs text-success">{t('savedToBank')}</span>}
            </div>
          </div>
        ))}
      </div>

      {data.jobUrl && (
        <a
          href={data.jobUrl}
          target="_blank"
          rel="noopener"
          data-testid="kit-apply"
          onClick={() => setAwaitingReturn('click')}
          className={`${accent} self-start`}
        >
          {t('apply')} ↗
        </a>
      )}
      {askApplied && (
        <div role="alertdialog" aria-label={t('didApply')} className="brutal flex items-center gap-3 p-3">
          <span className="font-semibold">{t('didApply')}</span>
          <button type="button" data-testid="kit-applied-yes" onClick={() => void confirmApplied(true)} className={accent}>{t('yes')}</button>
          <button type="button" data-testid="kit-applied-no" onClick={() => void confirmApplied(false)} className={`${quiet} border-transparent`}>{t('no')}</button>
        </div>
      )}
      {appliedState === 'done' && <p role="status" className="text-sm text-success">{t('appliedDone')}</p>}
      {appliedState === 'error' && <p role="alert" className="text-sm text-danger">{t('err_failed')}</p>}
    </section>
  );
}
