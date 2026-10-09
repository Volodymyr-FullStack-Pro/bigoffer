'use client';

import { MESSAGE_FORMATS, MESSAGE_LIMITS, type MessageFormat } from '@jp/ai';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { generateRecruiterMessage, listMessages, logSentMessage } from './message-actions';

const CHANNEL: Record<MessageFormat, 'linkedin' | 'telegram' | 'email'> = { linkedin_note: 'linkedin', inmail: 'linkedin', telegram: 'telegram', email: 'email' };

export function RecruiterMessage({ applicationId, defaultLang, onSent }: { applicationId: string; defaultLang: 'en' | 'uk' | 'ru'; onSent: () => void }) {
  const t = useTranslations('recruiter');
  const format = useFormatter();
  const now = useNow();
  const [fmt, setFmt] = useState<MessageFormat>('linkedin_note');
  const [kind, setKind] = useState<'intro' | 'follow_up'>('intro');
  const [lang, setLang] = useState(defaultLang);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<{ direction: string; channel: string; body: string; sentAt: string }[]>([]);

  useEffect(() => {
    void listMessages(applicationId).then((h) => {
      setHistory(h);
      if (h.some((m) => m.direction === 'out')) setKind('follow_up');
    }).catch(() => setHistory([]));
  }, [applicationId]);

  const field = 'brutal bg-card px-2 py-1 text-sm';
  const limit = MESSAGE_LIMITS[fmt];

  return (
    <section data-testid="recruiter-message" className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="font-mono text-xs">{t('title')}</h3>
      <div className="flex flex-wrap gap-2">
        <select data-testid="msg-format" aria-label={t('format')} value={fmt} onChange={(e) => setFmt(e.target.value as MessageFormat)} className={field}>
          {MESSAGE_FORMATS.map((f) => <option key={f} value={f}>{t(`format_${f}`)}</option>)}
        </select>
        <select data-testid="msg-kind" aria-label={t('kind')} value={kind} onChange={(e) => setKind(e.target.value as 'intro' | 'follow_up')} className={field}>
          <option value="intro">{t('intro')}</option>
          <option value="follow_up">{t('followUp')}</option>
        </select>
        <select data-testid="msg-lang" aria-label={t('lang')} value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'uk' | 'ru')} className={field}>
          {(['en', 'uk', 'ru'] as const).map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <button
          type="button"
          data-testid="msg-generate"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setSent(false);
            try {
              const res = await generateRecruiterMessage(applicationId, { format: fmt, kind, lang, tone: 'default' });
              if (res.ok) {
                setSubject(res.subject);
                setBody(res.body);
              } else setError(res.error);
            } catch {
              setError('failed');
            } finally {
              setBusy(false);
            }
          }}
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
              const ok = await logSentMessage(applicationId, CHANNEL[fmt], subject ? `${subject}\n\n${body}` : body);
              if (!ok) return setError('failed');
              setSent(true);
              setKind('follow_up');
              setHistory(await listMessages(applicationId));
              onSent();
            } catch {
              setError('failed');
            }
          }}
          className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          {sent ? `✓ ${t('logged')}` : t('sent')}
        </button>
      </div>
      {history.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {history.map((m, i) => (
            <li key={i} data-testid="msg-item" className="border-l-4 border-border pl-2">
              <span className="font-mono text-xs text-muted-foreground">{t(m.direction === 'out' ? 'outgoing' : 'incoming')} · {m.channel} · <span suppressHydrationWarning>{format.relativeTime(new Date(m.sentAt), now)}</span></span>
              <p className="line-clamp-3 whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
