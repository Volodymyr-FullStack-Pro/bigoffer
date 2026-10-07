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

const freshness = (m: FeedMatch) => Date.parse(m.postedAt ?? m.firstSeenAt);

export function filterMatches(items: FeedMatch[], f: FeedFilters, now: Date = new Date()): FeedMatch[] {
  const cutoff = now.getTime() - DAY_MS;
  return items.filter(
    (m) =>
      m.score >= f.minScore &&
      (f.remote === 'any' || m.remoteType === f.remote) &&
      (f.source === 'all' || m.postings.some((p) => p.sourceId === f.source)) &&
      (f.profileId === 'all' || m.profileId === f.profileId) &&
      (!f.fresh || freshness(m) >= cutoff),
  );
}

/** 'best' keeps the server order (score, then recency); 'newest' puts the freshest job first. */
export function sortMatches(items: FeedMatch[], sort: FeedFilters['sort']): FeedMatch[] {
  if (sort === 'best') return items;
  return [...items].sort((a, b) => freshness(b) - freshness(a));
}
