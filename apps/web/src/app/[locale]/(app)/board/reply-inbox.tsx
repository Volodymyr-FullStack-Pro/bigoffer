'use client';

import { useTranslations } from 'next-intl';
import { tellGenie } from '@/lib/genie/events';
import { useState } from 'react';
import type { BoardCardView, BoardColumn } from './board-types';
import { logReply, logSentMessage, type ReplyChannel, setReplyKind, suggestReplyKind } from './message-actions';
import { columnForReply, REPLY_KINDS, REPLY_STYLE, type ReplyKind } from './reply-kinds';
import { fromZonedInput, toZonedInput } from './zoned-input';

const LINK_HINT: Partial<Record<ReplyChannel, string>> = { djinni: 'djinni', email: 'email', linkedin: 'linkedin' };
const CHANNELS: ReplyChannel[] = ['djinni', 'dou', 'robotaua', 'email', 'linkedin', 'telegram', 'call', 'other'];

/**
 * Adds to the conversation: what the company answered (AI sorts it, the card gets a coloured tag and moves on) or what
 * the candidate answered (restarts the follow-up clock).
 */
export function ReplyInbox({ card, defaultAuthor, columns, timeZone, lang, onLogged }: {
  card: BoardCardView;
  defaultAuthor: string;
  columns: BoardColumn[];
  timeZone: string;
  lang: 'en' | 'uk' | 'ru';
  onLogged: (patch: Partial<BoardCardView>, moveTo: BoardColumn | null) => void;
}) {
  const t = useTranslations('board');
  const [body, setBody] = useState('');
  // Most replies come through the board the application went out on.
  const [channel, setChannel] = useState<ReplyChannel>(CHANNELS.find((c) => c === card.sourceId) ?? 'email');
  const [kind, setKind] = useState<ReplyKind | null>(null);
  const [when, setWhen] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [author, setAuthor] = useState(defaultAuthor);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Theirs (sorted by AI, moves the card) or mine (what I answered: keeps the whole conversation in one place).
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const mine = direction === 'out';

  const fromKey = columns.find((c) => c.id === card.columnId)?.key ?? '';
  const target = (k: ReplyKind | null): BoardColumn | null => {
    const want = k ? columnForReply(k, fromKey) : null;
    const col = want ? columns.find((c) => ('key' in want ? c.key === want.key : c.kind === want.kind)) : undefined;
    return col && col.id !== card.columnId ? col : null;
  };
  const moveTo = mine ? null : target(kind);
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
      if (res.recruiterName && !author) setAuthor(res.recruiterName);
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setBody('');
    setKind(null);
    setWhen('');
    setSummary(null);
    setLink('');
    setSaved(true);
  };

  const saveMine = async () => {
    setBusy('save');
    setError(null);
    try {
      if (!(await logSentMessage(card.id, channel, body, link))) return setError('failed');
      const at = new Date().toISOString();
      onLogged({ lastActivityAt: at, lastMessage: { direction: 'out', at } }, null);
      tellGenie({ type: 'sent' });
      reset();
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (mine) return saveMine();
    if (!kind) return;
    setBusy('save');
    setError(null);
    try {
      const interviewAt = kind === 'interview_invite' && when ? fromZonedInput(when, timeZone) : null;
      const res = await logReply(card.id, { channel, body, kind, summary, interviewAt, author, link });
      if (!res) return setError('failed');
      onLogged({ replyKind: kind, ...res, lastMessage: { direction: 'in', at: new Date().toISOString() } }, moveTo);
      tellGenie({ type: 'reply', kind });
      reset();
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section data-testid="reply-inbox" className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-xs">{t('replyAddTitle')}</h3>
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
      <div role="tablist" aria-label={t('replyAddTitle')} className="grid grid-cols-2 gap-1 rounded-full border border-border p-1">
        {(['in', 'out'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={direction === d}
            data-testid="reply-direction"
            data-direction={d}
            onClick={() => { setDirection(d); setSaved(false); setError(null); }}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${direction === d ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t(d === 'in' ? 'replyTheirs' : 'replyMine')}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label={t('replyChannel')} className="flex flex-col gap-1.5">
        <span className="font-mono text-xs">{t(mine ? 'replyChannelMine' : 'replyChannel')}</span>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              data-testid="reply-channel"
              data-channel={c}
              onClick={() => setChannel(c)}
              className={`rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold ${channel === c ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {t(`channel_${c}` as never)}
            </button>
          ))}
        </div>
      </div>
      <textarea
        data-testid="reply-body"
        value={body}
        maxLength={10_000}
        onChange={(e) => { setBody(e.target.value); setSaved(false); }}
        placeholder={t(mine ? 'replyPlaceholderMine' : 'replyPlaceholder')}
        aria-label={t(mine ? 'replyMine' : 'replyTitle')}
        className={`${field} min-h-24`}
      />
      {!mine && (<>
      <div className="flex flex-wrap gap-2">
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
      </>)}
      <div className="grid gap-2 sm:grid-cols-2">
        {!mine && <label className="flex flex-col gap-1 font-mono text-xs">
          {t('replyAuthor')}
          <input data-testid="reply-author" value={author} maxLength={120} onChange={(e) => setAuthor(e.target.value)} className={field} />
        </label>}
        <label className="flex flex-col gap-1 font-mono text-xs">
          {t('replyLink')}
          <input data-testid="reply-link" type="url" value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} placeholder={t(`replyLinkHint_${LINK_HINT[channel] ?? 'other'}` as never)} className={field} />
        </label>
      </div>
      {!mine && kind && <p data-testid="reply-hint" className="text-xs text-muted-foreground">{t(`replyHint_${kind}` as never)}</p>}
      {!mine && kind === 'interview_invite' && (
        <label className="flex flex-col gap-1 font-mono text-xs">
          {t('replyWhen')}
          <input data-testid="reply-when" type="datetime-local" value={when || toZonedInput(card.nextActionAt, timeZone)} onChange={(e) => setWhen(e.target.value)} className={field} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="reply-save" disabled={!body.trim() || (!mine && !kind) || busy !== null} onClick={save} className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground disabled:opacity-50">
          {mine ? t('replySaveMine') : moveTo ? t('replySaveMove', { column: moveTo.title }) : t('replySave')}
        </button>
        {saved && <span data-testid="reply-saved" className="text-sm">✓ {t('replySaved')}</span>}
        {error && <span data-testid="reply-error" role="alert" className="text-sm text-danger">{t(`replyErr_${error}` as never)}</span>}
      </div>
    </section>
  );
}
