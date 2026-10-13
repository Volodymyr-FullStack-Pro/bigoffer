'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormatter, useTranslations } from 'next-intl';
import { SourceBadge } from '@/components/ui/source-badge';
import type { BoardCardView, BoardLabel } from './board-types';
import { REPLY_STYLE } from './reply-kinds';

const URGENCY_STYLE: Record<string, string> = {
  interview_soon: 'bg-ai text-ai-foreground',
  overdue: 'bg-danger text-white',
  ghosting: 'bg-foreground text-background',
  ping: 'bg-warning text-brand-foreground',
};

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
  const reply = card.replyKind ? REPLY_STYLE[card.replyKind] : null;
  const upcoming = card.nextActionAt && new Date(card.nextActionAt) > now ? new Date(card.nextActionAt) : null;
  return (
    <article
      ref={setNodeRef}
      data-testid="board-card"
      data-card-id={card.id}
      data-reply-kind={card.replyKind ?? undefined}
      style={{ transform: CSS.Transform.toString(transform), transition, ...(reply ? { borderLeftColor: reply.bg, borderLeftWidth: 6 } : {}) }}
      className={`brutal flex cursor-grab flex-col gap-1.5 p-3 ${isDragging ? 'opacity-40' : ''}`}
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
      {reply && card.replyKind && (
        <span data-testid="card-reply" className="self-start rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: reply.bg, color: reply.fg, boxShadow: `0 0 10px -2px ${reply.bg}` }}>
          <span aria-hidden>{reply.icon}</span> {t(`reply_${card.replyKind}` as never)}
        </span>
      )}
      <span className="font-display font-bold leading-tight">{card.title}</span>
      <span className="text-sm text-muted-foreground">{card.company}</span>
      {own.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {own.map((l) => (
            <span key={l.id} data-testid="card-label" className="rounded-full border border-black/20 px-2 py-0.5 text-[11px] font-semibold text-black" style={{ background: l.color, boxShadow: `0 0 8px -2px ${l.color}` }}>
              {labelName(l)}
            </span>
          ))}
        </span>
      )}
      {upcoming && (
        <span data-testid="card-next" suppressHydrationWarning className="font-mono text-xs font-semibold">
          ⏰ {format.dateTime(upcoming, { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        {card.sourceId && <SourceBadge sourceId={card.sourceId} />}
        {card.appliedAt && <span suppressHydrationWarning>{t('appliedAgo', { ago: format.relativeTime(new Date(card.appliedAt), now) })}</span>}
        {card.urgency in URGENCY_STYLE && (
          <span data-testid="card-urgency" data-urgency={card.urgency} className={`rounded-sm border border-border px-1 font-bold ${URGENCY_STYLE[card.urgency]}`}>
            {t(`urgency_${card.urgency}` as never)}
          </span>
        )}
      </span>
    </article>
  );
}
