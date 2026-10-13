'use client';

import { isLocale, type Locale } from '@jp/core';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApplyKitPanel } from '@/components/apply-kit/apply-kit-panel';
import { SourceBadge } from '@/components/ui/source-badge';
import { listMessages } from './message-actions';
import { RecruiterMessage } from './recruiter-message';
import { ReplyInbox } from './reply-inbox';
import { useModalDialog } from './use-modal-dialog';
import { fromZonedInput, toZonedInput } from './zoned-input';
import { createLabel, getApplicationEvents, markPinged, setApplicationLabel, updateApplication } from './actions';
import type { BoardCardView, BoardColumn, BoardLabel } from './board-types';

/** Cards that need something show what, in the card's urgency colour. */
const NEXT_STEP: Record<string, string> = {
  interview_soon: '#F472B6',
  your_move: '#38BDF8',
  step_passed: '#F59E0B',
  overdue: '#EF4444',
  ghosting: '#71717A',
  ping: '#F59E0B',
};

/** History label key: an inbound message reads "reply received", not "message sent". */
function eventKey(e: { type: string; payload: unknown }): string {
  const p = (e.payload ?? {}) as { direction?: unknown };
  return e.type === 'message' && p.direction === 'in' ? 'message_in' : e.type;
}

export function CardPanel({ card, timeZone, columns, labels, labelName, companyContact, onClose, onMove, onDelete, onChanged, onLabelCreated, onApplied, onReplyLogged }: {
  card: BoardCardView;
  timeZone: string;
  columns: BoardColumn[];
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  /** A recruiter known from another card of the same company, offered when this card has none. */
  companyContact: { name: string; url: string | null } | null;
  onClose: () => void;
  onMove: (columnId: string) => void;
  onDelete: () => void;
  onChanged: (patch: Partial<BoardCardView>) => void;
  onLabelCreated: (l: BoardLabel) => void;
  onApplied: (r: { columnId: string; rank: string }) => void;
  onReplyLogged: (patch: Partial<BoardCardView>, moveTo: BoardColumn | null) => void;
}) {
  const t = useTranslations('board');
  const tk = useTranslations('kit');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';
  const [kitOpen, setKitOpen] = useState(false);
  const [dialogRef, onDialogCancel] = useModalDialog(onClose);
  const format = useFormatter();
  const now = useNow();
  const [events, setEvents] = useState<{ type: string; payload: unknown; createdAt: string }[]>([]);
  const [messagesVersion, setMessagesVersion] = useState(0);
  const [salary, setSalary] = useState(card.salary ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [next, setNext] = useState(toZonedInput(card.nextActionAt, timeZone));
  const [contactName, setContactName] = useState(card.contactName ?? '');
  const [contactUrl, setContactUrl] = useState(card.contactUrl ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#C6F432');
  const [error, setError] = useState(false);

  const [threadLink, setThreadLink] = useState<string | null>(null);
  useEffect(() => {
    listMessages(card.id).then((m) => setThreadLink(m.find((x) => x.link)?.link ?? null)).catch(() => setThreadLink(null));
  }, [card.id, messagesVersion]);

  useEffect(() => {
    getApplicationEvents(card.id).then(setEvents).catch(() => setEvents([]));
  }, [card.id, card.columnId, card.labelIds.length, card.followUpCount, card.lastActivityAt, card.replyKind, messagesVersion]);

  const attempt = async (fn: () => Promise<boolean>): Promise<boolean> => {
    let ok = false;
    try {
      ok = await fn();
    } catch {
      ok = false;
    }
    setError(!ok);
    return ok;
  };

  const save = async () => {
    const patch = {
      salary: salary.trim() || null,
      notes: notes.trim() || null,
      nextActionAt: next ? fromZonedInput(next, timeZone) : null,
      contactName: contactName.trim() || null,
      contactUrl: contactUrl.trim() || null,
    };
    const ok = await attempt(() => updateApplication(card.id, patch));
    if (ok) onChanged({ salary: patch.salary, notes: patch.notes, nextActionAt: patch.nextActionAt, contactName: patch.contactName, contactUrl: patch.contactUrl });
  };

  const field = 'brutal bg-card px-2 py-1 font-sans text-sm';
  return (
    <dialog ref={dialogRef} onCancel={onDialogCancel} aria-labelledby="panel-title" data-testid="card-panel" className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md overflow-y-auto border-l border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50">
      <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="panel-title" className="font-display text-xl font-semibold leading-tight">{card.title}</h2>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            {card.company}
            {card.sourceId && <SourceBadge sourceId={card.sourceId} />}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')} className="font-mono text-lg">✕</button>
      </div>
      {card.urgency in NEXT_STEP && (
        <p data-testid="panel-next-step" data-urgency={card.urgency} className="brutal border-l-[6px] bg-card p-3 text-sm" style={{ borderLeftColor: NEXT_STEP[card.urgency] }}>
          <span className="font-semibold">{t(`urgency_${card.urgency}` as never)}.</span> {t(`nextStep_${card.urgency}` as never)}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {card.url && <a href={card.url} target="_blank" rel="noopener" className="font-mono text-sm underline">{t('openOriginal')} ↗</a>}
        {threadLink && <a data-testid="panel-thread" href={threadLink} target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-semibold underline">{t('openThread')} ↗</a>}
      </div>
      {card.jobId && (
        <div className="flex flex-col gap-3">
          <button type="button" data-testid="apply-kit-open" aria-expanded={kitOpen} onClick={() => setKitOpen((v) => !v)} className="brutal brutal-press self-start px-4 py-2 font-semibold">
            {tk('open')}
          </button>
          {kitOpen && <ApplyKitPanel jobId={card.jobId} locale={locale} onApplied={onApplied} />}
        </div>
      )}
      <ReplyInbox
        card={card}
        defaultAuthor={card.contactName ?? companyContact?.name ?? ''}
        columns={columns}
        timeZone={timeZone}
        lang={locale}
        onLogged={(patch, moveTo) => {
          setMessagesVersion((v) => v + 1);
          if (patch.nextActionAt !== undefined) setNext(toZonedInput(patch.nextActionAt, timeZone));
          if (patch.contactName) setContactName(patch.contactName);
          onReplyLogged({ ...patch, lastMessage: { direction: 'in', at: new Date().toISOString() } }, moveTo);
        }}
      />
      <RecruiterMessage applicationId={card.id} defaultLang={locale} version={messagesVersion} onSent={() => { const at = new Date().toISOString(); onChanged({ lastActivityAt: at, lastMessage: { direction: 'out', at } }); }} />
      <label className="flex flex-col gap-1 font-mono text-xs">
        {t('moveTo')}
        <select data-testid="panel-move" value={card.columnId} onChange={(e) => onMove(e.target.value)} className={field}>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="panel-pinged" onClick={async () => { if (await attempt(() => markPinged(card.id))) onChanged({ followUpCount: card.followUpCount + 1, lastActivityAt: new Date().toISOString() }); }} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionPinged')}</button>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-xs">{t('labels')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const on = card.labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                data-testid="panel-label"
                data-label-id={l.id}
                aria-pressed={on}
                onClick={async () => {
                  if (await attempt(() => setApplicationLabel(card.id, l.id, !on))) onChanged({ labelIds: on ? card.labelIds.filter((x) => x !== l.id) : [...card.labelIds, l.id] });
                }}
                className={`rounded-sm border-[1.5px] border-border px-2 py-0.5 font-mono text-xs ${on ? '' : 'opacity-50'}`}
                style={{ background: on ? l.color : undefined }}
              >
                {labelName(l)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={40} placeholder={t('newLabel')} className={`${field} flex-1`} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label={t('labelColor')} className="h-9 w-10 border-[1.5px] border-border" />
          <button type="button" onClick={async () => { let l: BoardLabel | null = null; try { l = await createLabel(newLabel, newColor.toUpperCase()); } catch { l = null; } setError(!l); if (l) { onLabelCreated(l); setNewLabel(''); } }} className="brutal brutal-press px-3 text-sm font-semibold">+</button>
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 font-mono text-xs">{t('salary')}<input data-testid="panel-salary" value={salary} maxLength={120} onChange={(e) => setSalary(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs">{t('nextAction')}<input data-testid="panel-next-action" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} className={field} /></label>
      {!contactName && companyContact && (
        <p data-testid="company-contact" className="text-sm">
          {t('companyContact', { company: card.company, name: companyContact.name })}{' '}
          <button type="button" data-testid="company-contact-use" onClick={() => { setContactName(companyContact.name); if (companyContact.url && !contactUrl) setContactUrl(companyContact.url); }} className="font-semibold underline">
            {t('companyContactUse')}
          </button>
        </p>
      )}
      <label className="flex flex-col gap-1 font-mono text-xs">{t('contactName')}<input value={contactName} maxLength={120} onChange={(e) => setContactName(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs">{t('contactUrl')}<input type="url" value={contactUrl} onChange={(e) => setContactUrl(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs">{t('notes')}<textarea data-testid="panel-notes" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} className={`${field} min-h-24`} /></label>
      <div className="flex items-center gap-3">
        <button type="button" data-testid="panel-save" onClick={save} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('save')}</button>
        {error && <span role="alert" className="text-sm text-danger">{t('saveError')}</span>}
        <button type="button" data-testid="panel-delete" onClick={() => { if (window.confirm(t('deleteConfirm'))) onDelete(); }} className="ml-auto text-sm text-danger underline">{t('delete')}</button>
      </div>
      <section data-testid="panel-history" className="flex flex-col gap-1 border-t border-border pt-3">
        <h3 className="font-mono text-xs">{t('history')}</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {events.map((e, i) => (
            <li key={i}>{t(`event_${eventKey(e)}` as never)} · <span suppressHydrationWarning className="font-mono text-xs text-muted-foreground">{format.relativeTime(new Date(e.createdAt), now)}</span></li>
          ))}
        </ul>
      </section>
      </div>
    </dialog>
  );
}
