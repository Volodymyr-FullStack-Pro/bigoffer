'use client';

import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/ui/score-meter';
import { SourceBadge } from '@/components/ui/source-badge';
import type { FeedMatch } from './feed-types';

/** One "episode row" of the feed: score, title, then company · board · age in the mono voice. */
export function FeedListItem({ match, selected, onSelect }: { match: FeedMatch; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('today');
  const format = useFormatter();
  const now = useNow();
  const sourceId = match.postings[0]?.sourceId;
  return (
    <button
      type="button"
      data-testid="job-match"
      data-match-id={match.id}
      aria-current={selected}
      onClick={onSelect}
      className={`relative flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors ${
        selected ? 'bg-muted before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-[image:var(--brand-gradient)]' : 'hover:bg-muted/60'
      }`}
    >
      <ScoreMeter score={match.score} label={t('match')} />
      <span className="font-display font-bold leading-tight">{match.title}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
        <span className="truncate">{match.company}</span>
        {sourceId && <SourceBadge sourceId={sourceId} />}
        <span suppressHydrationWarning>{format.relativeTime(new Date(match.postedAt ?? match.firstSeenAt), now)}</span>
      </span>
    </button>
  );
}
