'use client';

import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { deleteMessage, listMessages, type ReplyChannel, setMessageKind, updateMessage } from './message-actions';
import { CHANNELS } from './reply-inbox';
import { REPLY_KINDS, REPLY_STYLE, type ReplyKind } from './reply-kinds';

type Message = Awaited<ReturnType<typeof listMessages>>[number];

/** The whole conversation with the company as a chat: theirs on the left, yours on the right, oldest first. */
export function Conversation({ applicationId, version, onDeleted, onKindChanged }: {
  applicationId: string;
  version: number;
  onDeleted: (r: { replyKind: Message['kind']; left: Message[] }) => void;
  /** A saved reply was re-tagged: the card's tag and "responded" follow, the panel may move the card. */
  onKindChanged: (r: { kind: ReplyKind; replyKind: ReplyKind | null; firstResponseAt: string | null }) => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const clock = useNow({ updateInterval: 60_000 });
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  // The message being corrected (channel, sender, text, link) and its draft.
  const [draft, setDraft] = useState<{ id: string; channel: ReplyChannel; author: string; body: string; link: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listMessages(applicationId).then((m) => setMessages([...m].reverse())).catch(() => setMessages([]));
  }, [applicationId, version]);

  if (messages === null) return null;
  return (
    <section data-testid="conversation" className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="font-mono text-xs">{t('conversationTitle', { count: messages.length })}</h3>
      {messages.length === 0 && <p className="text-sm text-muted-foreground">{t('conversationEmpty')}</p>}
      <ol className="flex flex-col gap-2">
        {messages.map((m, i) => {
          const mine = m.direction === 'out';
          const style = m.kind ? REPLY_STYLE[m.kind] : null;
          const long = m.body.length > 280;
          const expanded = open.has(i);
          // A message saved a moment ago must not read "in 2 minutes" when the browser clock lags behind the server.
          const at = new Date(m.sentAt);
          const now = at > clock ? at : clock;
          return (
            <li
              key={m.id}
              data-testid="msg-item"
              data-direction={m.direction}
              className={`flex max-w-[92%] flex-col gap-1 rounded-2xl border px-3 py-2 text-sm ${mine ? 'self-end rounded-br-sm border-brand/40 bg-brand/10' : 'self-start rounded-bl-sm border-border bg-card'}`}
              style={!mine && style ? { borderLeftColor: style.bg, borderLeftWidth: 4 } : undefined}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{mine ? t('conversationMe') : (m.author ?? t('conversationThem'))}</span>
                <span>· {t(`channel_${m.channel}` as never)}</span>
                <span suppressHydrationWarning>· {format.relativeTime(at, now)}</span>
                <button
                  type="button"
                  data-testid="msg-edit"
                  aria-label={t('conversationEdit')}
                  title={t('conversationEdit')}
                  onClick={() => setDraft(draft?.id === m.id ? null : { id: m.id, channel: m.channel as ReplyChannel, author: m.author ?? '', body: m.body, link: m.link ?? '' })}
                  className="ml-auto grid size-5 place-items-center rounded-full hover:bg-muted"
                >
                  ✎
                </button>
                <button
                  type="button"
                  data-testid="msg-delete"
                  aria-label={t('conversationDelete')}
                  title={t('conversationDelete')}
                  onClick={async () => {
                    if (!window.confirm(t('conversationDeleteConfirm'))) return;
                    const res = await deleteMessage(applicationId, m.id).catch(() => null);
                    if (!res) return;
                    const left = messages.filter((x) => x.id !== m.id);
                    setMessages(left);
                    onDeleted({ replyKind: res.replyKind, left });
                  }}
                  className="grid size-5 place-items-center rounded-full hover:bg-muted"
                >
                  ×
                </button>
                {!mine && (
                  <button
                    type="button"
                    data-testid="msg-kind-edit"
                    title={t('conversationChangeKind')}
                    aria-expanded={editing === m.id}
                    onClick={() => setEditing((e) => (e === m.id ? null : m.id))}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-foreground/30 hover:ring-foreground"
                    style={style ? { background: style.bg, color: style.fg } : undefined}
                  >
                    {m.kind ? t(`reply_${m.kind}` as never) : t('conversationSetKind')}
                    <span className="opacity-80">· {t('conversationChange')} ▾</span>
                  </button>
                )}
              </span>
              {editing === m.id && (
                <span role="radiogroup" aria-label={t('conversationChangeKind')} className="flex flex-wrap gap-1">
                  {REPLY_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={m.kind === k}
                      data-testid="msg-kind-option"
                      data-kind={k}
                      onClick={async () => {
                        setEditing(null);
                        if (k === m.kind) return;
                        const res = await setMessageKind(applicationId, m.id, k).catch(() => null);
                        if (!res) return;
                        setMessages((list) => list && list.map((x) => (x.id === m.id ? { ...x, kind: k } : x)));
                        onKindChanged({ kind: k, ...res });
                      }}
                      className={`rounded-full border-[1.5px] px-2 py-0.5 text-[11px] font-semibold ${m.kind === k ? 'border-foreground' : 'border-transparent opacity-70 hover:opacity-100'}`}
                      style={{ background: REPLY_STYLE[k].bg, color: REPLY_STYLE[k].fg }}
                    >
                      <span aria-hidden>{REPLY_STYLE[k].icon}</span> {t(`reply_${k}` as never)}
                    </button>
                  ))}
                </span>
              )}
              {draft?.id === m.id ? (
                <span data-testid="msg-edit-form" className="flex flex-col gap-2">
                  <span className="flex flex-wrap gap-1">
                    {CHANNELS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        data-testid="msg-edit-channel"
                        data-channel={c}
                        aria-pressed={draft.channel === c}
                        onClick={() => setDraft({ ...draft, channel: c })}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${draft.channel === c ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}
                      >
                        {t(`channel_${c}` as never)}
                      </button>
                    ))}
                  </span>
                  {!mine && <input data-testid="msg-edit-author" value={draft.author} maxLength={120} placeholder={t('replyAuthor')} onChange={(e) => setDraft({ ...draft, author: e.target.value })} className="brutal bg-card px-2 py-1 text-sm" />}
                  <input data-testid="msg-edit-link" type="url" value={draft.link} maxLength={500} placeholder={t('replyLink')} onChange={(e) => setDraft({ ...draft, link: e.target.value })} className="brutal bg-card px-2 py-1 text-sm" />
                  <textarea data-testid="msg-edit-body" value={draft.body} maxLength={10_000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="brutal min-h-24 bg-card px-2 py-1 text-sm" />
                  <span className="flex gap-2">
                    <button
                      type="button"
                      data-testid="msg-edit-save"
                      disabled={saving || !draft.body.trim()}
                      onClick={async () => {
                        setSaving(true);
                        const ok = await updateMessage(applicationId, m.id, { channel: draft.channel, author: draft.author, body: draft.body, link: draft.link }).catch(() => false);
                        setSaving(false);
                        if (!ok) return;
                        setMessages((list) => list && list.map((x) => (x.id === m.id ? { ...x, channel: draft.channel, author: mine ? x.author : draft.author.trim() || null, body: draft.body.trim(), link: draft.link.trim() || null } : x)));
                        setDraft(null);
                      }}
                      className="brutal brutal-press bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                    >
                      {t('save')}
                    </button>
                    <button type="button" onClick={() => setDraft(null)} className="px-2 text-xs underline">{t('cancel')}</button>
                  </span>
                </span>
              ) : (<>
              {m.summary && <p className="text-xs italic">{m.summary}</p>}
              <p className={`whitespace-pre-line ${long && !expanded ? 'line-clamp-5' : ''}`}>{m.body}</p>
              <span className="flex flex-wrap gap-3 font-mono text-[11px]">
                {long && (
                  <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="underline">
                    {expanded ? t('conversationLess') : t('conversationMore')}
                  </button>
                )}
                {m.link && <a data-testid="msg-link" href={m.link} target="_blank" rel="noopener noreferrer" className="underline">{t('openThread')} ↗</a>}
              </span>
              </>)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
