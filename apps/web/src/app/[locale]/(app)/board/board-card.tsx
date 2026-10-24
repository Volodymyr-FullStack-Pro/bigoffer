'use client';

import { AlarmClock, CornerDownLeft, Hourglass, MessageSquare } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormatter, useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/ui/score-meter';
import { SiteBadge, SourceBadge } from '@/components/ui/source-badge';
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

/** Urgencies that ask for a reminder: the card shows its match score beside the badge. */
const REMIND = new Set(['ping', 'overdue', 'ghosting']);

const FEEDBACK_STYLE = { tone: 'wait' as StatusTone, icon: Hourglass };

export function BoardCardItem({ card, stripe, labels, labelName, now, timeZone, onOpen }: {
  card: BoardCardView;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  timeZone: string;
  onOpen: () => void;
  /** The stage colour (from the column) for the card's left stripe. */
  stripe?: string;
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
  // In the lost column the reasons below already say it was a rejection.
  const showReply = !waiting && Boolean(reply && card.replyKind) && !(card.replyKind === 'rejection' && card.outcome !== 'open');
  return (
    <article
      ref={setNodeRef}
      data-testid="board-card"
      data-card-id={card.id}
      data-reply-kind={card.replyKind ?? undefined}
      // No outline per urgency: the badge and this left stripe say it (the reply's colour, else the stage's).
      style={{ transform: CSS.Transform.toString(transform), transition, borderLeftColor: reply ? toneColor(reply.tone) : stripe, borderLeftWidth: 3 }}
      data-needs-action={card.urgency in URGENCY_TONE || undefined}
      className={`brutal flex min-w-0 cursor-grab flex-col gap-1.5 p-3 transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.45)] active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
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
      {showReply && reply && (
        <StatusBadge tone={reply.tone} icon={reply.icon} data-testid="card-reply">
          {t(`reply_${card.replyKind!}` as never)}
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
              <AlarmClock aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
              {format.dateTime(upcoming, { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {card.meetingUrl && card.outcome === 'open' && !waiting && <JoinMeeting url={card.meetingUrl} label={t('joinMeeting')} testId="card-join" compact />}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 tabular-nums text-xs text-muted-foreground">
        {card.sourceId ? <SourceBadge sourceId={card.sourceId} /> : <SiteBadge url={card.url} />}
        {card.messageCount > 0 && (
          <span data-testid="card-messages" title={t('conversationTitle', { count: card.messageCount })} className="rounded-full bg-muted px-1.5">
            <MessageSquare aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
            {card.messageCount}
            {card.lastMessage?.direction === 'in' && <CornerDownLeft aria-label={t('lastFromThem')} className="ml-1 inline size-3 -translate-y-px" />}
          </span>
        )}
        {card.appliedAt && <span suppressHydrationWarning>{t('appliedAgo', { ago: format.relativeTime(new Date(card.appliedAt), now) })}</span>}
        {/* "Your move" next to a reply badge only repeats it: the badge and the glow already say so. */}
        {card.urgency in URGENCY_TONE && !waiting && !(card.urgency === 'your_move' && showReply) && (
          <StatusBadge tone={URGENCY_TONE[card.urgency]!} data-testid="card-urgency" data-urgency={card.urgency} className="font-sans">
            {t(`urgency_${card.urgency}` as never)}
          </StatusBadge>
        )}
        {/* Next to "time to ping": how well the job fits, so the best matches get the reminder first. */}
        {REMIND.has(card.urgency) && card.score != null && <ScoreMeter score={card.score} label={t('match')} compact testId="card-score" />}
      </span>
    </article>
  );
}
