'use client';

import type { ChatTurn } from '@jp/ai';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useStoredState } from '@/lib/use-stored-state';
import { askAboutJob, type KitError } from './actions';

const parse = (raw: string): ChatTurn[] => {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as ChatTurn[]).filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string').slice(-20) : [];
  } catch {
    return [];
  }
};

/**
 * "Ask about this job": a short conversation with a coach who has read the posting and the CV. Kept in this browser
 * per job, so it is there after a reload; three starter questions for an empty chat.
 */
export function JobChat({ jobId }: { jobId: string }) {
  const t = useTranslations('jobChat');
  const [raw, setRaw] = useStoredState(`bo.chat.${jobId}`, '[]');
  const turns = parse(raw);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<KitError | null>(null);
  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const asked: ChatTurn[] = [...turns, { role: 'user', text }];
    setRaw(JSON.stringify(asked));
    setQuestion('');
    const res = await askAboutJob(jobId, text, turns).catch(() => ({ ok: false as const, error: 'failed' as const }));
    setBusy(false);
    if (res.ok) setRaw(JSON.stringify([...asked, { role: 'assistant', text: res.answer }].slice(-20)));
    else setError(res.error);
  };
  return (
    <section data-testid="job-chat" className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircleQuestion aria-hidden className="size-4 text-brand" />
          {t('title')}
        </h3>
        {turns.length > 0 && (
          <button type="button" onClick={() => setRaw('[]')} className="text-xs text-muted-foreground hover:text-foreground">
            {t('clear')}
          </button>
        )}
      </div>
      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {(['q1', 'q2', 'q3'] as const).map((k) => (
            <button key={k} type="button" data-testid="job-chat-starter" disabled={busy} onClick={() => void ask(t(k))} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50">
              {t(k)}
            </button>
          ))}
        </div>
      ) : (
        <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {turns.map((m, i) => (
            <li
              key={i}
              data-testid="job-chat-turn"
              data-role={m.role}
              className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${m.role === 'user' ? 'self-end bg-brand/15' : 'self-start bg-muted'}`}
            >
              {m.text}
            </li>
          ))}
          {busy && <li className="self-start rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{t('thinking')}</li>}
        </ol>
      )}
      {error && <p role="alert" className="text-sm text-danger">{t(`error_${error}`)}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          data-testid="job-chat-input"
          value={question}
          maxLength={1500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
        />
        <button type="submit" data-testid="job-chat-send" disabled={busy || !question.trim()} aria-label={t('send')} className="grid size-9 place-items-center rounded-xl bg-brand text-brand-foreground disabled:opacity-50">
          <Send aria-hidden className="size-4" />
        </button>
      </form>
    </section>
  );
}
