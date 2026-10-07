'use client';

import { BANK_KEYS, type Locale } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { deleteBankAnswer, saveBankAnswer } from './profile-extras-actions';

export type BankAnswer = { key: string; question: string; answer: string };

export function AnswerBank({ answers, locale }: { answers: BankAnswer[]; locale: Locale }) {
  const t = useTranslations('bank');
  const base: BankAnswer[] = BANK_KEYS.map((key) => answers.find((a) => a.key === key) ?? { key, question: t(`q_${key}`), answer: '' });
  const custom = answers.filter((a) => !(BANK_KEYS as readonly string[]).includes(a.key));
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries([...base, ...custom].map((a) => [a.key, a.answer])));
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const field = 'brutal bg-card px-2 py-1 text-sm';

  const save = async (a: BankAnswer) => {
    const res = await saveBankAnswer({ key: a.key, question: a.question, answer: values[a.key] ?? '', locale });
    setStatus(res.ok ? 'saved' : 'error');
  };

  return (
    <section data-testid="answer-bank" className="brutal flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      {[...base, ...custom].map((a) => (
        <div key={a.key} data-testid="bank-answer" data-key={a.key} className="flex flex-col gap-1">
          <label htmlFor={`bank-${a.key}`} className="font-mono text-xs uppercase">{a.question}</label>
          <div className="flex gap-2">
            <textarea id={`bank-${a.key}`} value={values[a.key] ?? ''} maxLength={2000} onChange={(e) => setValues((v) => ({ ...v, [a.key]: e.target.value }))} className={`${field} min-h-14 flex-1`} />
            <div className="flex flex-col gap-1">
              <button type="button" data-testid="bank-save" onClick={() => void save(a)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('save')}</button>
              {!(BANK_KEYS as readonly string[]).includes(a.key) && (
                <button type="button" onClick={async () => setStatus((await deleteBankAnswer(a.key)) ? 'saved' : 'error')} className="text-xs text-danger underline">{t('delete')}</button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
        <input data-testid="bank-add-question" value={newQ} maxLength={300} onChange={(e) => setNewQ(e.target.value)} placeholder={t('newQuestion')} className={field} />
        <textarea data-testid="bank-add-answer" value={newA} maxLength={2000} onChange={(e) => setNewA(e.target.value)} placeholder={t('newAnswer')} className={`${field} min-h-14`} />
        <button
          type="button"
          data-testid="bank-add"
          disabled={!newQ.trim() || !newA.trim()}
          onClick={async () => {
            const res = await saveBankAnswer({ key: null, question: newQ, answer: newA, locale });
            setStatus(res.ok ? 'saved' : 'error');
            if (res.ok) { setNewQ(''); setNewA(''); }
          }}
          className="brutal brutal-press self-start px-3 py-1 text-sm font-semibold disabled:opacity-50"
        >
          {t('add')}
        </button>
      </div>
      <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'error' && t('error')}</p>
    </section>
  );
}
