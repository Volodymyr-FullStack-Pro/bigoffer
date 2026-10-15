'use client';

import { sourceInfo } from '@jp/core';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/ui/score-meter';
import { LevelBadge, TechChip } from '@/components/ui/tech-chip';
import { SourceBadge } from '@/components/ui/source-badge';
import type { FeedMatch } from './feed-types';
import { DomainBadges } from './domain-badges';
import { HiddenReason } from './hidden-reason';

/** One "episode row" of the feed: score, title, then company · board · age in the mono voice. */
export function FeedListItem({
  match,
  selected,
  onSelect,
}: {
  match: FeedMatch;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('today');
  const tt = t;
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
        selected
          ? 'bg-muted before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-[image:var(--brand-gradient)]'
          : 'hover:bg-muted/60'
      }`}
    >
      <ScoreMeter score={match.score} label={t('match')} />
      <span className="font-display text-[15px] leading-snug font-bold">{match.title}</span>
      {match.excludedBy && <HiddenReason reason={match.excludedBy} />}
      <DomainBadges domains={match.domains} perks={match.perks} />
      {match.onBoard !== null && (
        <span
          data-testid="on-board-badge"
          className="self-start rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-link"
        >
          ✓ {t('onBoardShort')}
          {match.onBoardLeft.length > 0 && <> · {t('onBoardLeft', { platforms: match.onBoardLeft.map((s) => sourceInfo(s)?.name ?? s).join(', ') })}</>}
        </span>
      )}
      {match.requiredEnglish !== null && match.candidateEnglish !== null && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(match.candidateEnglish) < ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(match.requiredEnglish) && (
        <span data-testid="english-gap-badge" className="self-start rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
          English {match.requiredEnglish}
        </span>
      )}
      {match.onBoard === null && match.companyOnBoard && (
        <span
          data-testid="company-on-board-badge"
          title={t('companyOnBoard', { title: match.companyOnBoard.title, column: match.companyOnBoard.column })}
          className="self-start rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning"
        >
          ⚑ {t('companyOnBoardShort')}
        </span>
      )}
      {(match.seniority || match.skills.length > 0) && (
        <span className="flex flex-wrap gap-1">
          {match.seniority && (
            <LevelBadge level={match.seniority} label={tt(`seniority_${match.seniority}`)} />
          )}
          {match.skills
            .filter((x) => x.matched)
            .slice(0, 4)
            .map((x) => (
              <TechChip key={x.name} name={x.name} />
            ))}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums text-xs text-muted-foreground">
        {!match.companyIsPlaceholder && <span className="truncate">{match.company}</span>}
        {sourceId && <SourceBadge sourceId={sourceId} />}
        <span suppressHydrationWarning>
          {format.relativeTime(new Date(match.postedAt ?? match.firstSeenAt), now)}
        </span>
      </span>
    </button>
  );
}
