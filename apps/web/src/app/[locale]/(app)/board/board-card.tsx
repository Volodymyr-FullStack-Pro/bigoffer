'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormatter, useTranslations } from 'next-intl';
import type { BoardCardView, BoardLabel } from './board-types';

const URGENCY_STYLE: Record<string, string> = {
  interview_soon: 'bg-ai text-ai-foreground',
  overdue: 'bg-danger text-white',
  ghosting: 'bg-foreground text-background',
  ping: 'bg-warning text-brand-foreground',
};

export function BoardCardItem({ card, labels, labelName, now, onOpen }: {
  card: BoardCardView;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  onOpen: () => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const own = labels.filter((l) => card.labelIds.includes(l.id));
  return (
    <article
      ref={setNodeRef}
      data-testid="board-card"
      data-card-id={card.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
      <span className="font-display font-bold leading-tight">{card.title}</span>
      <span className="text-sm text-muted-foreground">{card.company}</span>
      {own.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {own.map((l) => (
            <span key={l.id} className="rounded-sm border border-border px-1 font-mono text-[10px] uppercase" style={{ background: l.color }}>
              {labelName(l)}
            </span>
          ))}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        {card.appliedAt && <span suppressHydrationWarning>{t('appliedAgo', { ago: format.relativeTime(new Date(card.appliedAt), now) })}</span>}
        {card.urgency in URGENCY_STYLE && (
          <span data-testid="card-urgency" data-urgency={card.urgency} className={`rounded-sm border border-border px-1 font-bold uppercase ${URGENCY_STYLE[card.urgency]}`}>
            {t(`urgency_${card.urgency}` as never)}
          </span>
        )}
      </span>
    </article>
  );
}
