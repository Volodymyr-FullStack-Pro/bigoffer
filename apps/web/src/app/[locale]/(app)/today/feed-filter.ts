import type { FeedMatch } from './feed-types';

export type FeedFilters = {
  profileId: string;
  minScore: number;
  remote: 'any' | 'remote' | 'hybrid' | 'office';
  source: string;
  /** Only jobs posted (or first seen) within the last 24 hours. */
  fresh: boolean;
  sort: 'best' | 'newest';
  /** Required experience: 'fit' = no more than the CV's years; a number = at most that many; jobs stating none always pass. */
  experience: 'any' | 'fit' | number;
  /** Job level ('intern' … 'lead'); jobs that state no level always pass. */
  level: 'all' | NonNullable<FeedMatch['seniority']>;
  /** Leave out vacancies for service in the armed forces. */
  noArmy: boolean;
};

export const DEFAULT_FILTERS: FeedFilters = { profileId: 'all', minScore: 0, remote: 'any', source: 'all', fresh: false, sort: 'best', experience: 'any', level: 'all', noArmy: false };

const DAY_MS = 24 * 3600 * 1000;

/** postedAt ?? firstSeenAt; a date in the future (bad source data) counts as now. */
const freshness = (m: FeedMatch, now: Date) => Math.min(Date.parse(m.postedAt ?? m.firstSeenAt), now.getTime());

function experienceFits(m: FeedMatch, want: FeedFilters['experience']): boolean {
  if (want === 'any' || m.requiredYears === null) return true;
  const limit = want === 'fit' ? m.candidateYears : want;
  return limit === null || m.requiredYears <= limit;
}

export function filterMatches(items: FeedMatch[], f: FeedFilters, now: Date = new Date()): FeedMatch[] {
  const cutoff = now.getTime() - DAY_MS;
  return items.filter(
    (m) =>
      m.score >= f.minScore &&
      (f.remote === 'any' || m.remoteType === f.remote) &&
      (f.source === 'all' || m.postings.some((p) => p.sourceId === f.source)) &&
      (f.profileId === 'all' || m.profileId === f.profileId) &&
      (!f.fresh || freshness(m, now) >= cutoff) &&
      experienceFits(m, f.experience) &&
      (f.level === 'all' || m.seniority === null || m.seniority === f.level) &&
      !(f.noArmy && m.domains.includes('military')),
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
