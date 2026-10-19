'use client';

import { columnCounters, NEEDS_ACTION } from '@jp/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowDownUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BoardCardItem } from './board-card';
import type { BoardCardView as Card, BoardColumn, BoardLabel } from './board-types';

/** A column longer than this folds its quiet cards: every card that needs you stays, plus the first quiet ones. */
const FOLD_AFTER = 12;
const MIN_QUIET = 5;

export function BoardColumnView({ column, cards, sort, onToggleSort, labels, labelName, now, timeZone, onOpen, expandAll = false }: {
  column: BoardColumn;
  cards: Card[];
  sort: 'smart' | 'manual';
  onToggleSort: () => void;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  timeZone: string;
  onOpen: (id: string) => void;
  /** A search or filter is on: show every match. */
  expandAll?: boolean;
}) {
  const t = useTranslations('board');
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });
  const { total, needsAction } = columnCounters(cards);
  const [expanded, setExpanded] = useState(false);
  const folds = !expandAll && cards.length > FOLD_AFTER;
  let quiet = 0;
  const quietLimit = Math.max(MIN_QUIET, FOLD_AFTER - needsAction);
  const visible = folds && !expanded ? cards.filter((c) => NEEDS_ACTION.has(c.urgency) || quiet++ < quietLimit) : cards;
  const hidden = cards.length - visible.length;
  return (
    <section data-testid="board-column" data-column-key={column.key} aria-label={column.title} className="flex w-[85vw] max-w-80 shrink-0 snap-start flex-col gap-3 sm:w-72">
      <header className="flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-display text-sm font-semibold">{column.title}</h2>
          <span data-testid="column-count" className="rounded-full bg-muted px-2 py-0.5 tabular-nums text-xs font-bold">
            {total}{needsAction > 0 && <span className="text-danger"> · ● {needsAction}</span>}
          </span>
        </span>
        <button
          type="button"
          data-testid="column-sort"
          onClick={onToggleSort}
          title={`${t(sort === 'smart' ? 'sortSmart' : 'sortManual')} — ${t('sortToggle')}`}
          aria-label={`${t(sort === 'smart' ? 'sortSmart' : 'sortManual')} — ${t('sortToggle')}`}
          aria-pressed={sort === 'smart'}
          className={`grid size-7 place-items-center rounded-full border transition-colors ${sort === 'smart' ? 'border-brand/50 bg-brand/15 text-link' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        >
          <ArrowDownUp className="size-3.5" aria-hidden />
        </button>
      </header>
      <SortableContext items={visible.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex min-h-24 flex-col gap-2 rounded-brutal border-[1.5px] border-dashed p-2 ${isOver ? 'border-brand bg-brand/10' : 'border-transparent'}`}>
          {visible.map((c) => (
            <BoardCardItem key={c.id} card={c} labels={labels} labelName={labelName} now={now} timeZone={timeZone} onOpen={() => onOpen(c.id)} />
          ))}
          {hidden > 0 && (
            <button type="button" data-testid="column-more" onClick={() => setExpanded(true)} className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              {t('columnMore', { count: hidden })} ▾
            </button>
          )}
          {folds && expanded && (
            <button type="button" data-testid="column-less" onClick={() => setExpanded(false)} className="rounded-xl px-3 py-1.5 text-xs text-muted-foreground underline">
              {t('columnLess')} ▴
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
