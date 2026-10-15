'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormatter, useTranslations } from 'next-intl';
import { SourceBadge } from '@/components/ui/source-badge';
import { StatusBadge, type StatusTone, toneColor } from '@/components/ui/status-badge';
import type { BoardCardView, BoardLabel } from './board-types';
import { JoinMeeting } from './join-meeting';
import { REPLY_STYLE } from './reply-kinds';

/** Urgency → badge tone. awaiting_feedback is shown as the card's main badge instead (see below). */
const URGENCY_TONE: Record<string, StatusTone> = {
  interview_soon: 'interview',
  your_move: 'move',
  step_passed: 'wait',
  overdue: 'danger',
  ghosting: 'neutral',
  ping: 'wait',
  feedback_due: 'wait',
  awaiting_feedback: 'wait',
};

/**
 * Outline per urgency. Only the two "act now" states glow (an interview within 48 h, the company waiting on you);
 * the rest get a quiet ring, so a busy board does not light up like a garland.
 */
const URGENCY_RING: Record<string, string> = {
  // outline + drop-shadow: the card style already owns box-shadow
  interview_soon: 'outline-2 outline-offset-2 outline-status-interview drop-shadow-[0_0_10px_color-mix(in_srgb,var(--status-interview)_45%,transparent)]',
  your_move: 'outline-2 outline-offset-2 outline-status-move drop-shadow-[0_0_10px_color-mix(in_srgb,var(--status-move)_45%,transparent)]',
  step_passed: 'outline-1 outline-offset-2 outline-status-wait/70',
  overdue: 'outline-1 outline-offset-2 outline-status-danger/70',
  ping: 'outline-1 outline-offset-2 outline-status-wait/50',
  feedback_due: 'outline-2 outline-offset-2 outline-status-wait',
  awaiting_feedback: 'outline-1 outline-offset-2 outline-status-wait/40',
};

const FEEDBACK_STYLE = { tone: 'wait' as StatusTone, icon: '⏳' };

export function BoardCardItem({ card, labels, labelName, now, timeZone, onOpen }: {
  card: BoardCardView;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  timeZone: string;
  onOpen: () => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const own = labels.filter((l) => card.labelIds.includes(l.id));
  // After the interview the card is about the feedback: its orange badge and edge replace the invite's pink ones.
  const waiting = card.urgency === 'awaiting_feedback' || card.urgency === 'feedback_due';
  const reply = waiting ? FEEDBACK_STYLE : card.replyKind ? REPLY_STYLE[card.replyKind] : null;
  const daysLeft = card.feedbackDueAt ? Math.max(1, Math.round((new Date(card.feedbackDueAt).getTime() - now.getTime()) / 86_400_000)) : 0;
  const upcoming = card.nextActionAt && new Date(card.nextActionAt) > now ? new Date(card.nextActionAt) : null;
  return (
    <article
      ref={setNodeRef}
      data-testid="board-card"
      data-card-id={card.id}
      data-reply-kind={card.replyKind ?? undefined}
      style={{ transform: CSS.Transform.toString(transform), transition, ...(reply ? { borderLeftColor: toneColor(reply.tone), borderLeftWidth: 4 } : {}) }}
      data-needs-action={card.urgency in URGENCY_TONE || undefined}
      className={`brutal flex min-w-0 cursor-grab flex-col gap-1.5 p-3 ${isDragging ? 'opacity-40' : ''} ${URGENCY_RING[card.urgency] ?? ''}`}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Enter only opens the panel; Space starts a keyboard drag (see the KeyboardSensor codes).
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
    >
      {waiting && (
        <StatusBadge tone={FEEDBACK_STYLE.tone} icon={FEEDBACK_STYLE.icon} data-testid="card-urgency" data-urgency={card.urgency}>
          {card.urgency === 'awaiting_feedback' ? t('feedbackBadge', { count: daysLeft }) : t('urgency_feedback_due')}
        </StatusBadge>
      )}
      {!waiting && reply && card.replyKind && (
        <StatusBadge tone={reply.tone} icon={reply.icon} data-testid="card-reply">
          {t(`reply_${card.replyKind}` as never)}
        </StatusBadge>
      )}
      {card.rejectionReasons.length > 0 && (card.outcome === 'rejected' || card.outcome === 'withdrawn' || card.outcome === 'ghosted') && (
        <span data-testid="card-reject-reasons" className="flex flex-wrap gap-1">
          {card.rejectionReasons.map((r) => (
            <StatusBadge key={r} tone="danger">
              {t(`reason_${r}` as never)}
            </StatusBadge>
          ))}
        </span>
      )}
      {/* Long titles like "HTML/CSS/JavaScript/React/Node.js" have no spaces to break at. */}
      <span className="font-display font-bold leading-tight [overflow-wrap:anywhere]">{card.title}</span>
      <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{card.company}</span>
      {own.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {own.map((l) => (
            <span key={l.id} data-testid="card-label" className="rounded-full border border-black/20 px-2 py-0.5 text-[11px] font-semibold text-black" style={{ background: l.color }}>
              {labelName(l)}
            </span>
          ))}
        </span>
      )}
      {(upcoming || (card.meetingUrl && !waiting)) && (
        <span className="flex flex-wrap items-center gap-2">
          {upcoming && (
            <span data-testid="card-next" suppressHydrationWarning className="tabular-nums text-xs font-semibold">
              ⏰ {format.dateTime(upcoming, { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {card.meetingUrl && card.outcome === 'open' && !waiting && <JoinMeeting url={card.meetingUrl} label={t('joinMeeting')} testId="card-join" compact />}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 tabular-nums text-xs text-muted-foreground">
        {card.sourceId && <SourceBadge sourceId={card.sourceId} />}
        {card.messageCount > 0 && (
          <span data-testid="card-messages" title={t('conversationTitle', { count: card.messageCount })} className="rounded-full bg-muted px-1.5">
            💬 {card.messageCount}{card.lastMessage?.direction === 'in' ? ' ←' : ''}
          </span>
        )}
        {card.appliedAt && <span suppressHydrationWarning>{t('appliedAgo', { ago: format.relativeTime(new Date(card.appliedAt), now) })}</span>}
        {card.urgency in URGENCY_TONE && !waiting && (
          <StatusBadge tone={URGENCY_TONE[card.urgency]!} data-testid="card-urgency" data-urgency={card.urgency} className="font-sans">
            {t(`urgency_${card.urgency}` as never)}
          </StatusBadge>
        )}
      </span>
    </article>
  );
}
