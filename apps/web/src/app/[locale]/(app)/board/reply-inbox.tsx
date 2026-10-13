'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BoardCardView, BoardColumn } from './board-types';
import { logReply, type ReplyChannel, setReplyKind, suggestReplyKind } from './message-actions';
import { columnForReply, REPLY_KINDS, REPLY_STYLE, type ReplyKind } from './reply-kinds';
import { fromZonedInput, toZonedInput } from './zoned-input';

const CHANNELS: ReplyChannel[] = ['email', 'linkedin', 'djinni', 'telegram', 'call', 'other'];

/** Where the candidate pastes what a company answered: AI sorts it, the card gets a coloured tag and moves on. */
export function ReplyInbox({ card, columns, timeZone, lang, onLogged }: {
  card: BoardCardView;
  columns: BoardColumn[];
  timeZone: string;
  lang: 'en' | 'uk' | 'ru';
  onLogged: (patch: Partial<BoardCardView>, moveTo: BoardColumn | null) => void;
}) {
  const t = useTranslations('board');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<ReplyChannel>('email');
  const [kind, setKind] = useState<ReplyKind | null>(null);
  const [when, setWhen] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const target = (k: ReplyKind | null): BoardColumn | null => {
    const want = k ? columnForReply(k) : null;
    const col = want ? columns.find((c) => ('key' in want ? c.key === want.key : c.kind === want.kind)) : undefined;
    return col && col.id !== card.columnId ? col : null;
  };
  const moveTo = target(kind);
  const field = 'brutal bg-card px-2 py-1 text-sm';

  const classify = async () => {
    setBusy('ai');
    setError(null);
    try {
      const res = await suggestReplyKind(card.id, body, lang);
      if (!res.ok) return setError(res.error);
      setKind(res.kind);
      setSummary(res.summary || null);
      if (res.interviewAt) setWhen(res.interviewAt);
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!kind) return;
    setBusy('save');
    setError(null);
    try {
      const interviewAt = kind === 'interview_invite' && when ? fromZonedInput(when, timeZone) : null;
      const res = await logReply(card.id, { channel, body, kind, summary, interviewAt });
      if (!res) return setError('failed');
      onLogged({ replyKind: kind, ...res }, moveTo);
      setBody('');
      setKind(null);
      setWhen('');
      setSummary(null);
      setSaved(true);
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section data-testid="reply-inbox" className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-xs">{t('replyTitle')}</h3>
        {card.replyKind && (
          <button
            type="button"
            data-testid="reply-clear"
            onClick={async () => { if (await setReplyKind(card.id, null).catch(() => false)) onLogged({ replyKind: null }, null); }}
            className="text-xs text-muted-foreground underline"
          >
            {t('replyClear')}
          </button>
        )}
      </div>
      <textarea
        data-testid="reply-body"
        value={body}
        maxLength={10_000}
        onChange={(e) => { setBody(e.target.value); setSaved(false); }}
        placeholder={t('replyPlaceholder')}
        aria-label={t('replyTitle')}
        className={`${field} min-h-24`}
      />
      <div className="flex flex-wrap gap-2">
        <select data-testid="reply-channel" aria-label={t('replyChannel')} value={channel} onChange={(e) => setChannel(e.target.value as ReplyChannel)} className={field}>
          {CHANNELS.map((c) => <option key={c} value={c}>{t(`channel_${c}` as never)}</option>)}
        </select>
        <button type="button" data-testid="reply-classify" disabled={!body.trim() || busy !== null} onClick={classify} className="brutal brutal-press bg-ai px-3 py-1 text-sm font-semibold text-ai-foreground disabled:opacity-50">
          {busy === 'ai' ? t('replyReading') : t('replyClassify')}
        </button>
      </div>
      {summary && <p data-testid="reply-summary" className="text-sm italic">{summary}</p>}
      <div role="radiogroup" aria-label={t('replyKind')} className="flex flex-wrap gap-1.5">
        {REPLY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            data-testid="reply-kind"
            data-kind={k}
            onClick={() => setKind(k)}
            className={`rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold ${kind === k ? 'border-foreground' : 'border-transparent opacity-60 hover:opacity-100'}`}
            style={{ background: REPLY_STYLE[k].bg, color: REPLY_STYLE[k].fg }}
          >
            <span aria-hidden>{REPLY_STYLE[k].icon}</span> {t(`reply_${k}` as never)}
          </button>
        ))}
      </div>
      {kind && <p data-testid="reply-hint" className="text-xs text-muted-foreground">{t(`replyHint_${kind}` as never)}</p>}
      {kind === 'interview_invite' && (
        <label className="flex flex-col gap-1 font-mono text-xs">
          {t('replyWhen')}
          <input data-testid="reply-when" type="datetime-local" value={when || toZonedInput(card.nextActionAt, timeZone)} onChange={(e) => setWhen(e.target.value)} className={field} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="reply-save" disabled={!body.trim() || !kind || busy !== null} onClick={save} className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground disabled:opacity-50">
          {moveTo ? t('replySaveMove', { column: moveTo.title }) : t('replySave')}
        </button>
        {saved && <span data-testid="reply-saved" className="text-sm">✓ {t('replySaved')}</span>}
        {error && <span data-testid="reply-error" role="alert" className="text-sm text-danger">{t(`replyErr_${error}` as never)}</span>}
      </div>
    </section>
  );
}
