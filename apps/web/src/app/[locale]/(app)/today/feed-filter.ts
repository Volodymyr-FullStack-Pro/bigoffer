import type { FeedMatch } from './feed-types';

export type FeedFilters = {
  profileId: string;
  minScore: number;
  remote: 'any' | 'remote' | 'hybrid' | 'office';
  source: string;
};

export const DEFAULT_FILTERS: FeedFilters = { profileId: 'all', minScore: 0, remote: 'any', source: 'all' };

export function filterMatches(items: FeedMatch[], f: FeedFilters): FeedMatch[] {
  return items.filter(
    (m) =>
      m.score >= f.minScore &&
      (f.remote === 'any' || m.remoteType === f.remote) &&
      (f.source === 'all' || m.postings.some((p) => p.sourceId === f.source)) &&
      (f.profileId === 'all' || m.profileId === f.profileId),
  );
}
