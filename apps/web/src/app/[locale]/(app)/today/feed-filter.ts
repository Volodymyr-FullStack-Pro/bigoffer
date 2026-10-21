import type { JobDomain } from '@jp/core';
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
  /** One field ('all' = any). */
  domain: 'all' | JobDomain;
  /** Only jobs that offer reservation from mobilisation. */
  reservation: boolean;
};

export const DEFAULT_FILTERS: FeedFilters = { profileId: 'all', minScore: 0, remote: 'any', source: 'all', fresh: false, sort: 'best', experience: 'any', level: 'all', noArmy: false, domain: 'all', reservation: false };

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
      !(f.noArmy && m.domains.includes('military')) &&
      (f.domain === 'all' || m.domains.includes(f.domain)) &&
      (!f.reservation || m.perks.includes('reservation')),
  );
}

/**
 * 'Best' ranks by match, but a posting loses a point for every day past its third: replies go to the first
 * applicants, so a four-week-old 95% (most likely filled) must not sit above a fresh 90%.
 */
const AGE_FREE_DAYS = 3;
/**
 * A posting asking for more years than the CV has ranks lower: "experience level" is the most common rejection.
 * One year of stretch is free (worth applying); each year beyond costs 8 points, at most 30.
 */
const EXPERIENCE_STRETCH_YEARS = 1;
const POINTS_PER_MISSING_YEAR = 8;
const MAX_EXPERIENCE_PENALTY = 30;
export function experiencePenalty(m: Pick<FeedMatch, 'requiredYears' | 'candidateYears'>): number {
  if (m.requiredYears === null || m.candidateYears === null) return 0;
  const missing = m.requiredYears - m.candidateYears - EXPERIENCE_STRETCH_YEARS;
  return missing > 0 ? Math.min(MAX_EXPERIENCE_PENALTY, missing * POINTS_PER_MISSING_YEAR) : 0;
}
/** Freshness for ranking: a vacancy the company re-published (bumped) counts from that date; it is still hiring. */
const activity = (m: FeedMatch, now: Date) =>
  Math.max(freshness(m, now), m.refreshedAt ? Math.min(Date.parse(m.refreshedAt), now.getTime()) : 0);

export function rankScore(m: FeedMatch, now: Date = new Date()): number {
  const days = (now.getTime() - activity(m, now)) / DAY_MS;
  return m.score - Math.max(0, days - AGE_FREE_DAYS) - experiencePenalty(m);
}

export function sortMatches(items: FeedMatch[], sort: FeedFilters['sort'], now: Date = new Date()): FeedMatch[] {
  // Array.prototype.sort is stable: equal ranks keep the server order (score, then recency).
  if (sort === 'best') return [...items].sort((a, b) => rankScore(b, now) - rankScore(a, now));
  return [...items].sort((a, b) => activity(b, now) - activity(a, now));
}

/** Union of both sets, ordered like the 'best' feed: score desc, then created_at desc. */
export function mergeMatches(base: FeedMatch[], fresh: FeedMatch[]): FeedMatch[] {
  const seen = new Set(base.map((m) => m.id));
  return [...base, ...fresh.filter((m) => !seen.has(m.id))].sort(
    (a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
