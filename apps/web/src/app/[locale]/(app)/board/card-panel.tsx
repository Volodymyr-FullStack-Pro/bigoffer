'use client';

import { GraduationCap, PenLine } from 'lucide-react';
import { isLocale, type Locale } from '@jp/core';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ApplyKitPanel } from '@/components/apply-kit/apply-kit-panel';
import { SourceBadge } from '@/components/ui/source-badge';
import { Link } from '@/i18n/navigation';
import { PREP_COLUMNS } from '../prep/prep-types';
import { listMessages } from './message-actions';
import { RecruiterMessage, type RecruiterMessageHandle } from './recruiter-message';
import { JoinMeeting } from './join-meeting';
import { Conversation } from './conversation';
import { columnForReply } from './reply-kinds';
import { ReplyInbox, type RejectionSuggestion } from './reply-inbox';
import { useModalDialog } from './use-modal-dialog';
import { fromZonedInput, toZonedInput } from './zoned-input';
import { createLabel, getApplicationEvents, markPinged, setApplicationLabel, updateApplication } from './actions';
import { FeedbackWait } from './feedback-wait';
import type { BoardCardView, BoardColumn, BoardLabel } from './board-types';

/** Cards that need something show what, in the card's urgency colour. */
const PREP_KEYS: ReadonlySet<string> = new Set(PREP_COLUMNS);
const SECTIONS = ['overview', 'conversation', 'details', 'history'] as const;
type Section = (typeof SECTIONS)[number];
/** Columns where the card may wait for the company's verdict: after an interview or a test task sent. */
const WAIT_KEYS: ReadonlySet<string> = new Set(['interview', 'test_task']);

const NEXT_STEP: Record<string, string> = {
  interview_soon: 'var(--status-interview)',
  your_move: 'var(--status-move)',
  step_passed: 'var(--status-wait)',
  overdue: 'var(--status-danger)',
  ghosting: 'var(--status-neutral)',
  ping: 'var(--status-wait)',
  feedback_due: 'var(--status-wait)',
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
  onReplyLogged: (patch: Partial<BoardCardView>, moveTo: BoardColumn | null, rejection?: RejectionSuggestion | null) => void;
}) {
  const t = useTranslations('board');
  const tk = useTranslations('kit');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';
  const [kitOpen, setKitOpen] = useState(false);
  const [dialogRef, onDialogCancel] = useModalDialog(onClose);
  const pressedOutside = useRef(false);
  const format = useFormatter();
  const now = useNow();
  const [events, setEvents] = useState<{ type: string; payload: unknown; createdAt: string }[]>([]);
  const [messagesVersion, setMessagesVersion] = useState(0);
  const writer = useRef<RecruiterMessageHandle>(null);
  // Section navigation: the pinned header jumps to a section and highlights the one being read.
  const anchors = useRef<Partial<Record<Section, HTMLElement | null>>>({});
  const header = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('overview');
  const offset = () => (header.current?.offsetHeight ?? 0) + 8;
  const jump = (to: Section) => {
    const el = anchors.current[to];
    const box = dialogRef.current;
    if (el && box) {
      // Measured against the panel itself (not offsetTop), and instant: a smooth scroll can be cut short by late content.
      const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - offset();
      box.scrollTo({ top: Math.max(0, top) });
    }
    setSection(to);
  };
  const spy = () => {
    const box = dialogRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + offset();
    let current: Section = 'overview';
    for (const s of SECTIONS) {
      const el = anchors.current[s];
      if (el && el.getBoundingClientRect().top <= top + 4) current = s;
    }
    setSection(current);
  };
  const [salary, setSalary] = useState(card.salary ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [next, setNext] = useState(toZonedInput(card.nextActionAt, timeZone));
  const [contactName, setContactName] = useState(card.contactName ?? '');
  const [contactUrl, setContactUrl] = useState(card.contactUrl ?? '');
  const [meeting, setMeeting] = useState(card.meetingUrl ?? '');
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
      meetingUrl: meeting.trim() || null,
    };
    const ok = await attempt(() => updateApplication(card.id, patch));
    if (ok) onChanged({ salary: patch.salary, notes: patch.notes, nextActionAt: patch.nextActionAt, contactName: patch.contactName, contactUrl: patch.contactUrl, meetingUrl: patch.meetingUrl });
  };

  const field = 'brutal bg-card px-2 py-1 font-sans text-sm';
  return (
    <dialog
      ref={dialogRef}
      onCancel={onDialogCancel}
      // A click on the dimmed page around the panel closes it (press and release both outside, so a text selection
      // that ends outside does not).
      onPointerDown={(e) => { pressedOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedOutside.current && e.target === e.currentTarget) onClose(); pressedOutside.current = false; }}
      onScroll={spy}
      aria-labelledby="panel-title" data-testid="card-panel" className="fixed inset-y-0 right-0 left-auto m-0 h-auto max-h-none w-full max-w-md overflow-y-auto border-l border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50">
      <div className="flex min-h-full flex-col gap-4 p-5 pb-24">
      <div ref={header} className="glass sticky top-0 z-10 -mx-5 -mt-5 flex flex-col gap-2 border-b border-border px-5 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="panel-title" className="font-display text-xl font-semibold leading-tight [overflow-wrap:anywhere]">{card.title}</h2>
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
              {card.company}
              {card.sourceId && <SourceBadge sourceId={card.sourceId} />}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close')} className="text-lg">✕</button>
        </div>
        <div className="flex items-center gap-2">
          <nav aria-label={t('sections')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                data-testid="panel-nav"
                data-section={s}
                aria-current={section === s ? 'true' : undefined}
                onClick={() => jump(s)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${section === s ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t(`section_${s}`)}
              </button>
            ))}
          </nav>
          {card.urgency === 'your_move' && card.lastMessage?.direction === 'in' ? (
            <button
              type="button"
              data-testid="panel-primary"
              onClick={() => { jump('conversation'); writer.current?.writeReply(); }}
              className="brutal brutal-press shrink-0 bg-ai px-3 py-1 text-xs font-semibold text-ai-foreground"
            >
              <PenLine aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
              {t('actionReply')}
            </button>
          ) : card.urgency === 'interview_soon' && card.meetingUrl && !card.feedbackDueAt ? (
            <JoinMeeting url={card.meetingUrl} label={t('joinMeeting')} testId="panel-primary" compact />
          ) : card.urgency === 'feedback_due' || card.urgency === 'ping' || card.urgency === 'overdue' ? (
            <button
              type="button"
              data-testid="panel-primary"
              onClick={async () => { if (await attempt(() => markPinged(card.id))) onChanged({ followUpCount: card.followUpCount + 1, lastActivityAt: new Date().toISOString(), feedbackDueAt: null }); }}
              className="brutal brutal-press shrink-0 px-3 py-1 text-xs font-semibold"
            >
              {t('actionPinged')}
            </button>
          ) : null}
        </div>
      </div>
      <span ref={(el) => { anchors.current.overview = el; }} aria-hidden className="block scroll-mt-36" />
      {card.rejectionReasons.length > 0 && card.outcome !== 'open' && card.outcome !== 'offer' && (
        <p data-testid="panel-reject-reasons" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          <span className="font-semibold">{t(card.outcome === 'withdrawn' ? 'rejectedByMe' : 'rejectedLine')}:</span>{' '}
          {card.rejectionReasons.map((r) => t(`reason_${r}` as never)).join(', ')}
          {card.rejectionStage && <span className="text-muted-foreground"> · {t(`stage_${card.rejectionStage}` as never)}</span>}
        </p>
      )}
      {card.replyKind === 'rejection' && columns.find((c) => c.id === card.columnId)?.kind === 'active' && (
        <p data-testid="panel-move-rejected" className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          <span className="flex-1">{t('rejectedNotMoved')}</span>
          <button
            type="button"
            data-testid="panel-move-rejected-go"
            onClick={() => { const lost = columns.find((c) => c.kind === 'lost'); if (lost) onMove(lost.id); }}
            className="brutal brutal-press bg-danger px-3 py-1 text-xs font-semibold text-white"
          >
            {t('rejectedMove')}
          </button>
        </p>
      )}
      {card.urgency in NEXT_STEP && (
        <p data-testid="panel-next-step" data-urgency={card.urgency} className="brutal border-l-[6px] bg-card p-3 text-sm" style={{ borderLeftColor: NEXT_STEP[card.urgency] }}>
          <span className="font-semibold">{t(`urgency_${card.urgency}` as never)}.</span> {t(`nextStep_${card.urgency}` as never)}
          {card.lastMessage?.direction === 'in' && (
            <button
              type="button"
              data-testid="panel-write-reply"
              onClick={() => writer.current?.writeReply()}
              className="brutal brutal-press mt-2 block bg-ai px-3 py-1 text-sm font-semibold text-ai-foreground"
            >
              <PenLine aria-hidden className="mr-1 inline size-4 -translate-y-px" />
              {t('writeReply')}
            </button>
          )}
        </p>
      )}
      {WAIT_KEYS.has(columns.find((c) => c.id === card.columnId)?.key ?? '') && card.outcome === 'open' && (
        <FeedbackWait
          applicationId={card.id}
          dueAt={card.feedbackDueAt}
          timeZone={timeZone}
          onChanged={(patch) => {
            onChanged(patch);
            if (patch.nextActionAt !== undefined) setNext(toZonedInput(patch.nextActionAt, timeZone));
          }}
          onThanks={() => writer.current?.writeReply(t('thanksNote'))}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {/* The interview is over once the card waits for feedback: no call to join. */}
        {card.meetingUrl && !card.feedbackDueAt && <JoinMeeting url={card.meetingUrl} label={t('joinMeeting')} testId="panel-join" />}
        {card.url && <a href={card.url} target="_blank" rel="noopener" className="tabular-nums text-sm underline">{t('openOriginal')} ↗</a>}
        {PREP_KEYS.has(columns.find((c) => c.id === card.columnId)?.key ?? '') && (
          <Link href={`/prep?start=${card.id}`} data-testid="panel-prep" className="tabular-nums text-sm font-semibold underline"><GraduationCap aria-hidden className="mr-1 inline size-4 -translate-y-px" />
            {t('prepare')}</Link>
        )}
        {threadLink && <a data-testid="panel-thread" href={threadLink} target="_blank" rel="noopener noreferrer" className="tabular-nums text-sm font-semibold underline">{t('openThread')} ↗</a>}
      </div>
      {card.jobId && (
        <div className="flex flex-col gap-3">
          <button type="button" data-testid="apply-kit-open" aria-expanded={kitOpen} onClick={() => setKitOpen((v) => !v)} className="brutal brutal-press self-start px-4 py-2 font-semibold">
            {tk('open')}
          </button>
          {kitOpen && <ApplyKitPanel jobId={card.jobId} locale={locale} onApplied={onApplied} />}
        </div>
      )}
      <span ref={(el) => { anchors.current.conversation = el; }} aria-hidden className="block scroll-mt-36" />
      <Conversation
        applicationId={card.id}
        version={messagesVersion}
        onDeleted={({ replyKind, left }) => {
          setMessagesVersion((v) => v + 1);
          const last = left.at(-1);
          onChanged({ replyKind, messageCount: left.length, lastMessage: last ? { direction: last.direction, at: last.sentAt } : null });
        }}
        onKindChanged={({ kind, replyKind, firstResponseAt }) => {
          setMessagesVersion((v) => v + 1);
          onChanged({ replyKind, firstResponseAt });
          const fromKey = columns.find((c) => c.id === card.columnId)?.key ?? '';
          // Only an auto-reply after all: the card goes back to waiting for an answer.
          if (!firstResponseAt && fromKey === 'talking') {
            const applied = columns.find((c) => c.key === 'applied');
            if (applied) onMove(applied.id);
            return;
          }
          const want = columnForReply(kind, fromKey);
          const col = want ? columns.find((c) => ('key' in want ? c.key === want.key : c.kind === want.kind)) : undefined;
          if (col && col.id !== card.columnId) onMove(col.id);
        }}
      />
      <ReplyInbox
        card={card}
        defaultAuthor={card.contactName ?? companyContact?.name ?? ''}
        columns={columns}
        timeZone={timeZone}
        lang={locale}
        onLogged={(patch, moveTo, rejection) => {
          setMessagesVersion((v) => v + 1);
          if (patch.nextActionAt !== undefined) setNext(toZonedInput(patch.nextActionAt, timeZone));
          if (patch.contactName) setContactName(patch.contactName);
          if (patch.meetingUrl) setMeeting(patch.meetingUrl);
          onReplyLogged(patch, moveTo, rejection);
        }}
      />
      <RecruiterMessage applicationId={card.id} defaultLang={locale} version={messagesVersion} ref={writer} onSent={() => { const at = new Date().toISOString(); setMessagesVersion((v) => v + 1); onChanged({ lastActivityAt: at, lastMessage: { direction: 'out', at } }); }} />
      <span ref={(el) => { anchors.current.details = el; }} aria-hidden className="block scroll-mt-36" />
      <label className="flex flex-col gap-1 tabular-nums text-xs">
        {t('moveTo')}
        <select data-testid="panel-move" value={card.columnId} onChange={(e) => onMove(e.target.value)} className={field}>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="panel-pinged" onClick={async () => { if (await attempt(() => markPinged(card.id))) onChanged({ followUpCount: card.followUpCount + 1, lastActivityAt: new Date().toISOString(), feedbackDueAt: null }); }} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionPinged')}</button>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="tabular-nums text-xs">{t('labels')}</legend>
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
                className={`rounded-sm border-[1.5px] border-border px-2 py-0.5 tabular-nums text-xs ${on ? '' : 'opacity-50'}`}
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
      <label className="flex flex-col gap-1 tabular-nums text-xs">{t('salary')}<input data-testid="panel-salary" value={salary} maxLength={120} onChange={(e) => setSalary(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 tabular-nums text-xs">{t('nextAction')}<input data-testid="panel-next-action" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 tabular-nums text-xs">
        {t('meetingUrl')}
        <input data-testid="panel-meeting" type="url" value={meeting} maxLength={500} onChange={(e) => setMeeting(e.target.value)} placeholder="https://meet.google.com/…" className={field} />
      </label>
      {!contactName && companyContact && (
        <p data-testid="company-contact" className="text-sm">
          {t('companyContact', { company: card.company, name: companyContact.name })}{' '}
          <button type="button" data-testid="company-contact-use" onClick={() => { setContactName(companyContact.name); if (companyContact.url && !contactUrl) setContactUrl(companyContact.url); }} className="font-semibold underline">
            {t('companyContactUse')}
          </button>
        </p>
      )}
      <label className="flex flex-col gap-1 tabular-nums text-xs">{t('contactName')}<input value={contactName} maxLength={120} onChange={(e) => setContactName(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 tabular-nums text-xs">{t('contactUrl')}<input type="url" value={contactUrl} onChange={(e) => setContactUrl(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 tabular-nums text-xs">{t('notes')}<textarea data-testid="panel-notes" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} className={`${field} min-h-24`} /></label>
      <div className="flex items-center gap-3">
        <button type="button" data-testid="panel-save" onClick={save} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('save')}</button>
        {error && <span role="alert" className="text-sm text-danger">{t('saveError')}</span>}
        <button type="button" data-testid="panel-delete" onClick={() => { if (window.confirm(t('deleteConfirm'))) onDelete(); }} className="ml-auto text-sm text-danger underline">{t('delete')}</button>
      </div>
      <span ref={(el) => { anchors.current.history = el; }} aria-hidden className="block scroll-mt-36" />
      <section data-testid="panel-history" className="flex flex-col gap-1 border-t border-border pt-3">
        <h3 className="tabular-nums text-xs">{t('history')}</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {events.map((e, i) => (
            <li key={i}>{t(`event_${eventKey(e)}` as never)} · <span suppressHydrationWarning className="tabular-nums text-xs text-muted-foreground">{format.relativeTime(new Date(e.createdAt), now)}</span></li>
          ))}
        </ul>
      </section>
      </div>
    </dialog>
  );
}
