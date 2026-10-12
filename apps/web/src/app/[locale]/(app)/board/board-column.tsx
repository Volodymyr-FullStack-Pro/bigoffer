'use client';

import { columnCounters } from '@jp/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowDownUp } from 'lucide-react';
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
    <section data-testid="board-column" data-column-key={column.key} aria-label={column.title} className="flex w-[85vw] max-w-80 shrink-0 snap-start flex-col gap-3 sm:w-72">
      <header className="flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-display text-sm font-semibold">{column.title}</h2>
          <span data-testid="column-count" className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-bold">
            {total}{needsAction > 0 && <span className="text-danger"> · ● {needsAction}</span>}
          </span>
        </span>
        <button
          type="button"
          data-testid="column-sort"
          onClick={onToggleSort}
          title={t('sortToggle')}
          aria-label={t('sortToggle')}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${sort === 'smart' ? 'border-brand/50 bg-brand/10 text-link' : 'border-border text-muted-foreground hover:bg-muted'}`}
        >
          <ArrowDownUp className="size-3" aria-hidden />
          {t(sort === 'smart' ? 'sortSmart' : 'sortManual')}
        </button>
      </header>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex min-h-24 flex-col gap-2 rounded-brutal border-[1.5px] border-dashed p-2 ${isOver ? 'border-brand bg-brand/10' : 'border-transparent'}`}>
          {cards.map((c) => (
            <BoardCardItem key={c.id} card={c} labels={labels} labelName={labelName} now={now} onOpen={() => onOpen(c.id)} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
