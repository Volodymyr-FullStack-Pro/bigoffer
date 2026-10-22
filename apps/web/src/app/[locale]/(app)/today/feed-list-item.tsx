'use client';

import { Flag, RefreshCw } from 'lucide-react';
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
  const sources = [...new Set(match.postings.map((p) => p.sourceId))];
  const have = match.techs.filter((x) => x.matched);
  const lack = match.techs.filter((x) => !x.matched);
  return (
    <button
      type="button"
      data-testid="job-match"
      data-match-id={match.id}
      aria-current={selected}
      onClick={onSelect}
      className={`relative flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors ${
        selected
          ? 'bg-muted before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-brand'
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
          className="self-start rounded-full bg-success/15 ring-1 ring-inset ring-success/40 px-2 py-0.5 text-xs font-semibold text-success"
        >
          ✓ {t('onBoardShort')}
          {match.onBoardLeft.length > 0 && <> · {t('onBoardLeft', { platforms: match.onBoardLeft.map((s) => sourceInfo(s)?.name ?? s).join(', ') })}</>}
        </span>
      )}
      {match.requiredEnglish !== null && match.candidateEnglish !== null && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(match.candidateEnglish) < ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(match.requiredEnglish) && (
        <span data-testid="english-gap-badge" className="self-start rounded-full bg-warning/25 ring-1 ring-inset ring-warning/45 px-2 py-0.5 text-xs font-semibold text-warning">
          English {match.requiredEnglish}
        </span>
      )}
      {match.refreshedAt && Date.parse(match.refreshedAt) > now.getTime() - 7 * 86_400_000 && (
        <span data-testid="refreshed-badge" className="self-start rounded-full bg-success/15 ring-1 ring-inset ring-success/40 px-2 py-0.5 text-xs font-semibold text-success" suppressHydrationWarning>
          <RefreshCw aria-hidden className="mr-1 inline size-3 -translate-y-px" />
          {t('refreshed', { ago: format.relativeTime(new Date(match.refreshedAt), now) })}
        </span>
      )}
      {match.onBoard === null && match.companyOnBoard && (
        <span
          data-testid="company-on-board-badge"
          title={t('companyOnBoard', { title: match.companyOnBoard.title, column: match.companyOnBoard.column })}
          className="self-start rounded-full bg-warning/25 ring-1 ring-inset ring-warning/45 px-2 py-0.5 text-xs font-semibold text-warning"
        >
          <Flag aria-hidden className="mr-1 inline size-3 -translate-y-px" />
          {t('companyOnBoardShort')}
          {match.companyOnBoard.sourceId && <> · {sourceInfo(match.companyOnBoard.sourceId)?.name ?? match.companyOnBoard.sourceId}</>}
        </span>
      )}
      {match.requiredYears !== null && match.candidateYears !== null && match.candidateYears < match.requiredYears && (
        <span data-testid="years-gap-badge" className="self-start rounded-full bg-warning/25 ring-1 ring-inset ring-warning/45 px-2 py-0.5 text-xs font-semibold text-warning">
          {t('yearsGap', { years: match.requiredYears })}
        </span>
      )}
      {(match.seniority || match.techs.length > 0) && (
        // What the job asks for at a glance: the user's technologies (✓), then up to two they have not listed (?).
        <span data-testid="job-reqs" className="flex flex-wrap items-center gap-1">
          {match.seniority && (
            <LevelBadge level={match.seniority} label={tt(`seniority_${match.seniority}`)} />
          )}
          {have.slice(0, 3).map((x) => (
            <TechChip key={x.name} name={x.name} check />
          ))}
          {lack.slice(0, 2).map((x) => (
            <span key={x.name} data-testid="req-unknown" className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              ? {x.name}
            </span>
          ))}
          {match.techs.length > 0 && (
            <span data-testid="req-count" className="text-xs tabular-nums text-muted-foreground">
              {t('reqCount', { have: have.length, total: match.techs.length })}
            </span>
          )}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums text-xs text-muted-foreground">
        {!match.companyIsPlaceholder && <span className="truncate">{match.company}</span>}
        {/* The same job on several boards is one row: every board it is on. */}
        {sources.map((id) => <SourceBadge key={id} sourceId={id} />)}
        <span suppressHydrationWarning>
          {format.relativeTime(new Date(match.postedAt ?? match.firstSeenAt), now)}
        </span>
      </span>
    </button>
  );
}
