'use client';

import { Check, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { type BoardFilter, EMPTY_FILTER, isFiltering } from './board-filter';
import type { BoardCard, BoardLabel } from './board-types';
import { toneChip } from '@/components/ui/status-badge';
import { REPLY_KINDS, REPLY_STYLE } from './reply-kinds';
import { ReplyIcon } from './reply-icon';

export function BoardFilterBar({ filter, onChange, cards, labels, labelName, found, onOpenOnly }: {
  filter: BoardFilter;
  onChange: (f: BoardFilter) => void;
  cards: BoardCard[];
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  found: number;
  /** Enter in the search box opens the card when exactly one matches. */
  onOpenOnly: () => void;
}) {
  const t = useTranslations('board');
  const input = useRef<HTMLInputElement>(null);

  // "/" jumps to the search box, as on most boards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || el?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const usedLabels = labels.filter((l) => cards.some((c) => c.labelIds.includes(l.id)));
  const usedReplies = REPLY_KINDS.filter((k) => cards.some((c) => c.replyKind === k));
  const chip = 'inline-flex items-center gap-1 rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold transition';
  const on = isFiltering(filter);

  return (
    <div data-testid="board-filter" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="brutal flex min-w-0 flex-1 items-center gap-2 bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-brand sm:max-w-md">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={input}
            type="search"
            data-testid="board-search"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && found === 1) {
                // Without this the same key press lands on the panel's close button once it takes focus.
                e.preventDefault();
                onOpenOnly();
              }
              if (e.key === 'Escape') onChange({ ...filter, query: '' });
            }}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {on && (
          <>
            <span data-testid="board-found" className="tabular-nums text-xs text-muted-foreground">{t('found', { count: found })}</span>
            <button type="button" data-testid="board-filter-clear" onClick={() => onChange(EMPTY_FILTER)} className="inline-flex items-center gap-1 text-xs underline">
              <X className="size-3" aria-hidden />
              {t('filterClear')}
            </button>
          </>
        )}
      </div>
      {(usedReplies.length > 0 || usedLabels.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {usedReplies.map((k) => {
            const active = filter.reply === k;
            return (
              <button
                key={k}
                type="button"
                data-testid="filter-reply"
                data-kind={k}
                aria-pressed={active}
                onClick={() => onChange({ ...filter, reply: active ? null : k })}
                className={`${chip} border-transparent ${toneChip(REPLY_STYLE[k].tone, active)}`}
              >
                <ReplyIcon kind={k} /> {t(`reply_${k}` as never)}
{active && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
              </button>
            );
          })}
          {usedReplies.length > 0 && (
            <button type="button" data-testid="filter-reply" data-kind="none" aria-pressed={filter.reply === 'none'} onClick={() => onChange({ ...filter, reply: filter.reply === 'none' ? null : 'none' })} className={`${chip} ${filter.reply === 'none' ? 'border-foreground bg-muted' : 'border-border text-muted-foreground'}`}>
              {t('replyNone')}
            </button>
          )}
          {usedLabels.map((l) => {
            const active = filter.labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                data-testid="filter-label"
                data-label-id={l.id}
                aria-pressed={active}
                onClick={() => onChange({ ...filter, labelIds: active ? filter.labelIds.filter((x) => x !== l.id) : [...filter.labelIds, l.id] })}
                className={`${chip} text-black ${active ? 'border-foreground' : 'border-transparent opacity-70 hover:opacity-100'}`}
                style={{ background: l.color }}
              >
                {labelName(l)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
