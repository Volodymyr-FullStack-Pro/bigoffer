'use client';

import { MESSAGE_FORMATS, MESSAGE_LIMITS, type MessageFormat, REPLY_LIMIT } from '@jp/ai';
import { useTranslations } from 'next-intl';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { tellGenie } from '@/lib/genie/events';
import { generateRecruiterMessage, listMessages, logSentMessage, type ReplyChannel } from './message-actions';

const CHANNEL: Record<MessageFormat, 'linkedin' | 'telegram' | 'email'> = { linkedin_note: 'linkedin', inmail: 'linkedin', telegram: 'telegram', email: 'email' };

type Kind = 'intro' | 'follow_up' | 'reply';
type Lang = 'en' | 'uk' | 'ru' | 'auto';
export type RecruiterMessageHandle = { /** Switch to a reply and write it right away. */ writeReply: () => void };

export function RecruiterMessage({
  applicationId,
  defaultLang,
  version = 0,
  ref,
  onSent,
}: {
  applicationId: string;
  defaultLang: 'en' | 'uk' | 'ru';
  /** Bumped when a message is logged elsewhere. */
  version?: number;
  ref?: Ref<RecruiterMessageHandle>;
  onSent: () => void;
}) {
  const t = useTranslations('recruiter');
  const [fmt, setFmt] = useState<MessageFormat>('linkedin_note');
  const [kind, setKind] = useState<Kind>('intro');
  const [lang, setLang] = useState<Lang>(defaultLang);
  // Where the recruiter last wrote; a reply is logged there. Null until they write.
  const [replyChannel, setReplyChannel] = useState<ReplyChannel | null>(null);
  const section = useRef<HTMLElement>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  
  useEffect(() => {
    // Their message waiting for an answer: a reply. After a first message of mine: a follow-up.
    void listMessages(applicationId).then((h) => {
      const lastIn = h.find((m) => m.direction === 'in');
      setReplyChannel(lastIn ? (lastIn.channel as ReplyChannel) : null);
      if (h[0]?.direction === 'in') {
        setKind('reply');
        setLang('auto');
      } else if (h.some((m) => m.direction === 'out')) {
        setKind('follow_up');
        setLang((l) => (l === 'auto' ? defaultLang : l));
      }
    }).catch(() => undefined);
  }, [applicationId, version, defaultLang]);

  const generate = async (k: Kind, l: Lang) => {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const res = await generateRecruiterMessage(applicationId, { format: fmt, kind: k, lang: l, tone: 'default' });
      if (res.ok) {
        setSubject(res.subject);
        setBody(res.body);
        if (res.channel) setReplyChannel(res.channel);
      } else setError(res.error);
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({
    writeReply: () => {
      setKind('reply');
      setLang('auto');
      section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      void generate('reply', 'auto');
    },
  }));

  const field = 'brutal bg-card px-2 py-1 text-sm';
  const reply = kind === 'reply';
  const limit = reply ? REPLY_LIMIT : MESSAGE_LIMITS[fmt];
  const logChannel: ReplyChannel = reply ? (replyChannel ?? 'other') : CHANNEL[fmt];

  return (
    <section ref={section} data-testid="recruiter-message" className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="font-mono text-xs">{t('title')}</h3>
      <div className="flex flex-wrap gap-2">
        <select
          data-testid="msg-kind"
          aria-label={t('kind')}
          value={kind}
          onChange={(e) => {
            const k = e.target.value as Kind;
            setKind(k);
            if (k === 'reply') setLang('auto');
            else if (lang === 'auto') setLang(defaultLang);
          }}
          className={field}
        >
          {replyChannel && <option value="reply">{t('reply')}</option>}
          <option value="intro">{t('intro')}</option>
          <option value="follow_up">{t('followUp')}</option>
        </select>
        {!reply && (
          <select data-testid="msg-format" aria-label={t('format')} value={fmt} onChange={(e) => setFmt(e.target.value as MessageFormat)} className={field}>
            {MESSAGE_FORMATS.map((f) => <option key={f} value={f}>{t(`format_${f}`)}</option>)}
          </select>
        )}
        <select data-testid="msg-lang" aria-label={t('lang')} value={lang} onChange={(e) => setLang(e.target.value as Lang)} className={field}>
          {reply && <option value="auto">{t('langAuto')}</option>}
          {(['en', 'uk', 'ru'] as const).map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <button
          type="button"
          data-testid="msg-generate"
          disabled={busy}
          onClick={() => void generate(kind, lang)}
          className="brutal brutal-press bg-ai px-3 py-1 text-sm font-semibold text-ai-foreground disabled:opacity-50"
        >
          {busy ? t('writing') : t('generate')}
        </button>
      </div>
      {error && <p data-testid="msg-error" role="alert" className="text-sm text-danger">{t(`err_${error}` as never)}</p>}
      {subject && <p className="text-sm"><span className="font-semibold">{t('subject')}:</span> {subject}</p>}
      <textarea data-testid="msg-body" value={body} maxLength={limit} onChange={(e) => { setBody(e.target.value); setSent(false); }} aria-label={t('body')} className={`${field} min-h-28`} />
      <p data-testid="msg-count" className="font-mono text-xs text-muted-foreground">{body.length} / {limit}</p>
      <div className="flex gap-2">
        <button type="button" data-testid="msg-copy" disabled={!body} onClick={() => void navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body).catch(() => undefined)} className="brutal brutal-press px-3 py-1 text-sm font-semibold disabled:opacity-50">{t('copy')}</button>
        <button
          type="button"
          data-testid="msg-sent"
          disabled={!body.trim() || sent}
          onClick={async () => {
            try {
              const ok = await logSentMessage(applicationId, logChannel, subject ? `${subject}\n\n${body}` : body);
              if (!ok) return setError('failed');
              setSent(true);
              setKind('follow_up');
              if (lang === 'auto') setLang(defaultLang);
              onSent();
              tellGenie({ type: 'sent' });
            } catch {
              setError('failed');
            }
          }}
          className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          {sent ? `✓ ${t('logged')}` : t('sent')}
        </button>
      </div>
    </section>
  );
}
