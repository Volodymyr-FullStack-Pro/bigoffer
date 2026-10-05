'use client';

import { useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/ui/score-meter';
import type { FeedMatch } from './feed-types';

export function FeedListItem({ match, selected, onSelect }: { match: FeedMatch; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('today');
  return (
    <button
      type="button"
      data-testid="job-match"
      data-match-id={match.id}
      aria-current={selected}
      onClick={onSelect}
      className={`flex w-full flex-col gap-1 border-b-2 border-border px-3 py-3 text-left ${selected ? 'bg-brand/30' : 'hover:bg-muted'}`}
    >
      <ScoreMeter score={match.score} label={t('match')} />
      <span className="font-display font-bold leading-tight">{match.title}</span>
      <span className="text-sm text-muted-foreground">{match.company}</span>
    </button>
  );
}
