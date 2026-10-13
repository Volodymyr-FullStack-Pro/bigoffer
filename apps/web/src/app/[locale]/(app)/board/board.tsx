'use client';

import { tellGenie } from '@/lib/genie/events';
import { applicationUrgency, type FollowUpRules, rankAtEnd, rankBetween, type RejectionInput, type RejectionReason, smartSort } from '@jp/core';
import { closestCorners, DndContext, type DragEndEvent, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Toast, useToast } from '@/components/ui/toast';
import { useSaveUiPrefs } from '@/lib/use-save-ui-prefs';
import { deleteApplication, markPinged, moveApplication, rejectApplication } from './actions';
import { AddCardDialog } from './add-card-dialog';
import { type BoardFilter, EMPTY_FILTER, isFiltering, matchesFilter } from './board-filter';
import { BoardFilterBar } from './board-filter-bar';
import { BoardColumnView } from './board-column';
import type { BoardCard, BoardCardView, BoardColumn, BoardLabel } from './board-types';
import { CardPanel } from './card-panel';
import { Confetti } from './confetti';
import { RejectDialog } from './reject-dialog';
import { TodayActions } from './today-actions';

type PendingReject = { id: string; columnId: string; rank: string; reasons: RejectionReason[]; outcome: 'rejected' | 'ghosted' };

export function Board({ columns, cards: initial, labels: initialLabels, rules, now: nowIso, timeZone, savedSort }: {
  columns: BoardColumn[];
  cards: BoardCard[];
  labels: BoardLabel[];
  rules: FollowUpRules;
  now: string;
  timeZone: string;
  /** Remembered per-column sort modes (column id -> mode). */
  savedSort?: Record<string, 'smart' | 'manual'>;
}) {
  const t = useTranslations('board');
  const saveUiPrefs = useSaveUiPrefs();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [cards, setCards] = useState(initial);
  const [labels, setLabels] = useState(initialLabels);
  const [sort, setSort] = useState<Record<string, 'smart' | 'manual'>>(
    Object.fromEntries(columns.map((c) => [c.id, savedSort?.[c.id] ?? (c.kind === 'active' ? 'smart' : 'manual')])),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<PendingReject | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const { toast, show, close } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const views: BoardCardView[] = useMemo(
    () =>
      cards.map((c) => ({
        ...c,
        urgency: applicationUrgency(
          {
            columnKind: columnById.get(c.columnId)?.kind ?? 'active',
            outcome: c.outcome,
            appliedAt: c.appliedAt ? new Date(c.appliedAt) : null,
            firstResponseAt: c.firstResponseAt ? new Date(c.firstResponseAt) : null,
            lastActivityAt: c.lastActivityAt ? new Date(c.lastActivityAt) : null,
            nextActionAt: c.nextActionAt ? new Date(c.nextActionAt) : null,
          },
          now,
          rules,
        ),
      })),
    [cards, columnById, now, rules],
  );
  const inColumn = (columnId: string) => views.filter((c) => c.columnId === columnId).sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1));
  const filtering = isFiltering(filter);
  const visible = (list: BoardCardView[]) => (filtering ? list.filter((c) => matchesFilter(c, filter)) : list);
  const shown = (columnId: string) => visible(sort[columnId] === 'smart' ? smartSort(inColumn(columnId)) : inColumn(columnId));
  const found = filtering ? views.filter((c) => matchesFilter(c, filter)) : views;
  const labelName = (l: BoardLabel) => (l.key ? t(`label_${l.key}` as never) : (l.name ?? ''));

  const patchLocal = (id: string, patch: Partial<BoardCard>) => setCards((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const commitMove = async (id: string, columnId: string, rank: string) => {
    const target = columnById.get(columnId)!;
    const card = cards.find((c) => c.id === id)!;
    const previous = { columnId: card.columnId, rank: card.rank, outcome: card.outcome, appliedAt: card.appliedAt };
    patchLocal(id, {
      columnId,
      rank,
      outcome: target.kind === 'won' ? 'offer' : target.kind === 'active' ? 'open' : card.outcome,
      appliedAt: target.key === 'applied' && !card.appliedAt ? new Date().toISOString() : card.appliedAt,
    });
    let ok = false;
    try {
      ok = await moveApplication(id, columnId, rank);
    } catch {
      ok = false;
    }
    if (!ok) {
      patchLocal(id, previous);
      return show({ message: t('moveError'), tone: 'error' });
    }
    if (target.kind === 'won' && card.columnId !== columnId) {
      setConfetti(true);
      tellGenie({ type: 'offer' });
    } else if (target.key === 'applied' && card.columnId !== columnId) tellGenie({ type: 'applied' });
  };

  const requestMove = (id: string, columnId: string, rank: string, reasons: RejectionReason[] = [], outcome: 'rejected' | 'ghosted' = 'rejected') => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const target = columnById.get(columnId);
    if (target?.kind === 'lost' && card.columnId !== columnId) setPendingReject({ id, columnId, rank, reasons, outcome });
    else void commitMove(id, columnId, rank);
  };

  const endRank = (columnId: string, excludeId: string) => {
    const list = inColumn(columnId).filter((c) => c.id !== excludeId);
    return rankAtEnd(list.at(-1)?.rank ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const overCard = cards.find((c) => c.id === overId);
    const columnId = overId.startsWith('column:') ? overId.slice('column:'.length) : overCard?.columnId;
    if (!columnId) return;
    if (card.columnId === columnId && (!overCard || sort[columnId] === 'smart')) return;
    if (!overCard || sort[columnId] === 'smart') return requestMove(id, columnId, endRank(columnId, id));
    // Manual order: place the card where it was dropped among the column's ranked cards.
    const ids = inColumn(columnId).map((c) => c.id).filter((x) => x !== id);
    const overIndex = ids.indexOf(overId);
    const sameColumn = card.columnId === columnId;
    const order = sameColumn ? arrayMove(inColumn(columnId).map((c) => c.id), inColumn(columnId).findIndex((c) => c.id === id), inColumn(columnId).findIndex((c) => c.id === overId)) : [...ids.slice(0, overIndex), id, ...ids.slice(overIndex)];
    const at = order.indexOf(id);
    const rankOf = (cid: string | undefined) => (cid ? cards.find((c) => c.id === cid)!.rank : null);
    if (sameColumn && at === inColumn(columnId).findIndex((c) => c.id === id)) return;
    let rank: string;
    try {
      rank = rankBetween(rankOf(order[at - 1]), rankOf(order[at + 1]));
    } catch {
      rank = endRank(columnId, id);
    }
    requestMove(id, columnId, rank);
  };

  const confirmReject = async (input: RejectionInput) => {
    if (!pendingReject) return;
    const { id, columnId, rank } = pendingReject;
    // Leaving the process yourself is a withdrawal; otherwise the pending outcome (rejected or ghosted).
    const outcome = input.by === 'me' ? 'withdrawn' : pendingReject.outcome;
    setPendingReject(null);
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const previous = { columnId: card.columnId, rank: card.rank, outcome: card.outcome };
    patchLocal(id, { columnId, rank, outcome });
    let ok = false;
    try {
      ok = await rejectApplication(id, columnId, rank, input, outcome);
    } catch {
      ok = false;
    }
    if (!ok) {
      patchLocal(id, previous);
      show({ message: t('moveError'), tone: 'error' });
    }
  };

  // Recruiters remembered per company: a new card from the same company is offered the known contact.
  const companyContacts = useMemo(() => {
    const map = new Map<string, { name: string; url: string | null }>();
    for (const c of [...cards].sort((a, b) => ((a.lastActivityAt ?? '') < (b.lastActivityAt ?? '') ? 1 : -1))) {
      const key = c.company.trim().toLowerCase();
      if (key && c.contactName && !map.has(key)) map.set(key, { name: c.contactName, url: c.contactUrl });
    }
    return map;
  }, [cards]);

  const lost = columns.find((c) => c.kind === 'lost');
  const open = views.find((c) => c.id === openId) ?? null;
  const active = views.find((c) => c.id === activeId) ?? null;

  return (
    <div data-testid="board" className="flex flex-col gap-6">
      <button type="button" data-testid="add-card" onClick={() => setAdding(true)} className="brutal-press self-start rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand/90">
        + {t('addCard')}
      </button>
      <TodayActions
        cards={views}
        onOpen={setOpenId}
        onPinged={async (id) => {
          let ok = false;
          try {
            ok = await markPinged(id);
          } catch {
            ok = false;
          }
          if (ok) patchLocal(id, { lastActivityAt: new Date().toISOString(), followUpCount: (cards.find((c) => c.id === id)?.followUpCount ?? 0) + 1 });
          else show({ message: t('moveError'), tone: 'error' });
        }}
        onGhosted={(id) => lost && requestMove(id, lost.id, endRank(lost.id, id), ['no_feedback'], 'ghosted')}
      />
      {cards.length === 0 && <p data-testid="board-empty" className="text-muted-foreground">{t('empty')}</p>}
      {cards.length > 0 && (
        <BoardFilterBar filter={filter} onChange={setFilter} cards={cards} labels={labels} labelName={labelName} found={found.length} onOpenOnly={() => found[0] && setOpenId(found[0].id)} />
      )}
      {filtering && found.length === 0 && <p data-testid="board-no-match" className="text-muted-foreground">{t('noMatch')}</p>}
      <DndContext id="board-dnd" sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active: a }) => setActiveId(String(a.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        {/* Phones scroll one column at a time; desktops show as many as fit. */}
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0">
          {columns.map((col) => (
            <BoardColumnView
              key={col.id}
              column={col}
              cards={shown(col.id)}
              sort={sort[col.id] ?? 'manual'}
              onToggleSort={() => {
                const mode = sort[col.id] === 'smart' ? 'manual' : 'smart';
                setSort((s) => ({ ...s, [col.id]: mode }));
                saveUiPrefs({ boardSort: { [col.id]: mode } });
              }}
              labels={labels}
              labelName={labelName}
              now={now}
              timeZone={timeZone}
              onOpen={setOpenId}
            />
          ))}
        </div>
        <DragOverlay>{active && <div className="brutal rotate-2 p-3 font-display font-bold">{active.title}</div>}</DragOverlay>
      </DndContext>
      {open && (
        <CardPanel
          card={open}
          timeZone={timeZone}
          columns={columns}
          labels={labels}
          labelName={labelName}
          companyContact={open.contactName ? null : (companyContacts.get(open.company.trim().toLowerCase()) ?? null)}
          onClose={() => setOpenId(null)}
          onMove={(columnId) => requestMove(open.id, columnId, endRank(columnId, open.id))}
          onDelete={async () => {
            const removed = cards.find((c) => c.id === open.id);
            setCards((list) => list.filter((c) => c.id !== open.id));
            setOpenId(null);
            let ok = false;
            try {
              ok = await deleteApplication(open.id);
            } catch {
              ok = false;
            }
            if (!ok) {
              if (removed) setCards((list) => (list.some((c) => c.id === removed.id) ? list : [...list, removed]));
              show({ message: t('moveError'), tone: 'error' });
            }
          }}
          onChanged={(patch) => patchLocal(open.id, patch)}
          onLabelCreated={(l) => setLabels((list) => [...list, l])}
          onReplyLogged={(patch, moveTo) => {
            patchLocal(open.id, patch);
            if (moveTo) requestMove(open.id, moveTo.id, endRank(moveTo.id, open.id));
          }}
          onApplied={(r) => patchLocal(open.id, { columnId: r.columnId, rank: r.rank, appliedAt: open.appliedAt ?? new Date().toISOString() })}
        />
      )}
      {pendingReject && <RejectDialog initialReasons={pendingReject.reasons} onConfirm={confirmReject} onCancel={() => setPendingReject(null)} />}
      {adding && <AddCardDialog columns={columns} onCreated={(c) => setCards((list) => [...list, c])} onClose={() => setAdding(false)} />}
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      <Toast toast={toast} onClose={close} />
    </div>
  );
}
