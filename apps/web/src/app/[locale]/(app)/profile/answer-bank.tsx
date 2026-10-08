'use client';

import { BANK_KEYS, type Locale } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { BANK_PLACEHOLDER_KEYS, OTHER, presetChoice, presetsFor } from './bank-presets';
import { deleteBankAnswer, saveBankAnswer } from './profile-extras-actions';

export type BankAnswer = { key: string; question: string; answer: string };

const FIELD = 'brutal bg-card px-2 py-1 text-sm';
const RESULT_MS = 4000;

type RowResult = 'saved' | 'error' | null;

function BankRow({ answer, locale, removable, onDeleted }: { answer: BankAnswer; locale: Locale; removable: boolean; onDeleted: (ok: boolean) => void }) {
  const t = useTranslations('bank');
  const presets = presetsFor(answer.key);
  const [value, setValue] = useState(answer.answer);
  const [other, setOther] = useState(presetChoice(answer.key, answer.answer) === OTHER);
  const [result, setResult] = useState<RowResult>(null);
  const [pending, startTransition] = useTransition();
  const id = `bank-${answer.key}`;

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  const edit = (next: string) => {
    setValue(next);
    setResult(null);
  };

  const choose = (choice: string) => {
    setResult(null);
    if (choice === OTHER) {
      setOther(true);
      if (presetChoice(answer.key, value) !== OTHER) setValue('');
      return;
    }
    setOther(false);
    setValue(choice);
  };

  const save = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await saveBankAnswer({ key: answer.key, question: answer.question, answer: value, locale });
        setResult(res.ok ? 'saved' : 'error');
      } catch {
        setResult('error');
      }
    });
  };

  const placeholder = (BANK_PLACEHOLDER_KEYS as readonly string[]).includes(answer.key) ? t(`ph_${answer.key as 'salary' | 'why_looking'}`) : undefined;
  const select = other ? OTHER : presetChoice(answer.key, value);

  return (
    <div data-testid="bank-answer" data-key={answer.key} className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-xs uppercase">{answer.question}</label>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          {presets ? (
            <>
              <select id={id} data-testid="bank-preset" value={select} onChange={(e) => choose(e.target.value)} className={FIELD}>
                <option value="">{t('choose')}</option>
                {presets.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value={OTHER}>{t('other')}</option>
              </select>
              {other && (
                <textarea value={value} maxLength={2000} onChange={(e) => edit(e.target.value)} aria-label={`${answer.question}: ${t('other')}`} placeholder={t('otherPlaceholder')} className={`${FIELD} min-h-14`} />
              )}
            </>
          ) : (
            <textarea id={id} value={value} maxLength={2000} onChange={(e) => edit(e.target.value)} placeholder={placeholder} className={`${FIELD} min-h-14`} />
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <button type="button" data-testid="bank-save" disabled={pending} onClick={save} className="brutal brutal-press px-3 py-1 text-sm font-semibold disabled:opacity-50">
            {pending ? t('saving') : t('save')}
          </button>
          <span data-testid="bank-row-status" aria-live="polite" className={`text-xs ${result === 'error' ? 'text-danger' : 'text-success'}`}>
            {result === 'saved' && `✓ ${t('saved')}`}
            {result === 'error' && t('error')}
          </span>
          {removable && (
            <button type="button" onClick={async () => onDeleted(await deleteBankAnswer(answer.key).catch(() => false))} className="text-xs text-danger underline">{t('delete')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnswerBank({ answers, locale }: { answers: BankAnswer[]; locale: Locale }) {
  const t = useTranslations('bank');
  const base: BankAnswer[] = BANK_KEYS.map((key) => answers.find((a) => a.key === key) ?? { key, question: t(`q_${key}`), answer: '' });
  const custom = answers.filter((a) => !(BANK_KEYS as readonly string[]).includes(a.key));
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'deleted' | 'error'>('idle');
  const [adding, startAdd] = useTransition();

  const add = () => {
    startAdd(async () => {
      try {
        const res = await saveBankAnswer({ key: null, question: newQ, answer: newA, locale });
        setStatus(res.ok ? 'saved' : 'error');
        if (res.ok) {
          setNewQ('');
          setNewA('');
        }
      } catch {
        setStatus('error');
      }
    });
  };

  return (
    <section data-testid="answer-bank" className="brutal flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      {[...base, ...custom].map((a) => (
        <BankRow key={a.key} answer={a} locale={locale} removable={!(BANK_KEYS as readonly string[]).includes(a.key)} onDeleted={(ok) => setStatus(ok ? 'deleted' : 'error')} />
      ))}
      <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
        <input data-testid="bank-add-question" value={newQ} maxLength={300} onChange={(e) => setNewQ(e.target.value)} placeholder={t('newQuestion')} className={FIELD} />
        <textarea data-testid="bank-add-answer" value={newA} maxLength={2000} onChange={(e) => setNewA(e.target.value)} placeholder={t('newAnswer')} className={`${FIELD} min-h-14`} />
        <button
          type="button"
          data-testid="bank-add"
          disabled={adding || !newQ.trim() || !newA.trim()}
          onClick={add}
          className="brutal brutal-press self-start px-3 py-1 text-sm font-semibold disabled:opacity-50"
        >
          {adding ? t('saving') : t('add')}
        </button>
      </div>
      <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'deleted' && t('deleted')}{status === 'error' && t('error')}</p>
    </section>
  );
}
