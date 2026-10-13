'use client';

import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { deleteMessage, listMessages } from './message-actions';
import { REPLY_STYLE } from './reply-kinds';

type Message = Awaited<ReturnType<typeof listMessages>>[number];

/** The whole conversation with the company as a chat: theirs on the left, yours on the right, oldest first. */
export function Conversation({ applicationId, version, onDeleted }: { applicationId: string; version: number; onDeleted: (r: { replyKind: Message['kind']; left: Message[] }) => void }) {
  const t = useTranslations('board');
  const format = useFormatter();
  const clock = useNow({ updateInterval: 60_000 });
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());

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
                  className="ml-auto grid size-5 place-items-center rounded-full hover:bg-muted"
                >
                  ×
                </button>
                {m.kind && style && (
                  <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.fg }}>
                    {t(`reply_${m.kind}` as never)}
                  </span>
                )}
              </span>
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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
