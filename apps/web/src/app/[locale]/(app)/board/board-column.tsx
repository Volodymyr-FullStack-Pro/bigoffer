'use client';

import { columnCounters } from '@jp/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { BoardCardItem } from './board-card';
import type { BoardCardView as Card, BoardColumn, BoardLabel } from './board-types';

export function BoardColumnView({ column, cards, sort, onToggleSort, labels, labelName, now, onOpen }: {
  column: BoardColumn;
  cards: Card[];
  sort: 'smart' | 'manual';
  onToggleSort: () => void;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('board');
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });
  const { total, needsAction } = columnCounters(cards);
  return (
    <section data-testid="board-column" data-column-key={column.key} aria-label={column.title} className="flex w-72 shrink-0 flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-black uppercase">{column.title}</h2>
        <span data-testid="column-count" className="font-mono text-xs font-bold">
          {total}{needsAction > 0 && <span className="text-danger"> · ● {needsAction}</span>}
        </span>
        <button type="button" data-testid="column-sort" onClick={onToggleSort} className="font-mono text-[10px] uppercase underline" aria-label={t('sortToggle')}>
          {t(sort === 'smart' ? 'sortSmart' : 'sortManual')}
        </button>
      </header>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex min-h-24 flex-col gap-2 rounded-brutal border-2 border-dashed p-2 ${isOver ? 'border-brand bg-brand/10' : 'border-transparent'}`}>
          {cards.map((c) => (
            <BoardCardItem key={c.id} card={c} labels={labels} labelName={labelName} now={now} onOpen={() => onOpen(c.id)} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
