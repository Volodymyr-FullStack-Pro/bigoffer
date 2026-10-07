import type { FeedMatch } from './feed-types';

export type FeedFilters = {
  profileId: string;
  minScore: number;
  remote: 'any' | 'remote' | 'hybrid' | 'office';
  source: string;
  /** Only jobs posted (or first seen) within the last 24 hours. */
  fresh: boolean;
  sort: 'best' | 'newest';
};

export const DEFAULT_FILTERS: FeedFilters = { profileId: 'all', minScore: 0, remote: 'any', source: 'all', fresh: false, sort: 'best' };

const DAY_MS = 24 * 3600 * 1000;

/** postedAt ?? firstSeenAt; a date in the future (bad source data) counts as now. */
const freshness = (m: FeedMatch, now: Date) => Math.min(Date.parse(m.postedAt ?? m.firstSeenAt), now.getTime());

export function filterMatches(items: FeedMatch[], f: FeedFilters, now: Date = new Date()): FeedMatch[] {
  const cutoff = now.getTime() - DAY_MS;
  return items.filter(
    (m) =>
      m.score >= f.minScore &&
      (f.remote === 'any' || m.remoteType === f.remote) &&
      (f.source === 'all' || m.postings.some((p) => p.sourceId === f.source)) &&
      (f.profileId === 'all' || m.profileId === f.profileId) &&
      (!f.fresh || freshness(m, now) >= cutoff),
  );
}

/** 'best' keeps the server order (score, then recency); 'newest' puts the freshest job first. */
export function sortMatches(items: FeedMatch[], sort: FeedFilters['sort'], now: Date = new Date()): FeedMatch[] {
  if (sort === 'best') return items;
  return [...items].sort((a, b) => freshness(b, now) - freshness(a, now));
}

/** Union of both sets, ordered like the 'best' feed: score desc, then created_at desc. */
export function mergeMatches(base: FeedMatch[], fresh: FeedMatch[]): FeedMatch[] {
  const seen = new Set(base.map((m) => m.id));
  return [...base, ...fresh.filter((m) => !seen.has(m.id))].sort(
    (a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
