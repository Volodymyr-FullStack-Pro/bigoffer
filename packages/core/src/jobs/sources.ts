import type { SourceId } from './job';

export type SourceMarket = 'ua' | 'remote' | 'global';

export type SourceInfo = {
  id: SourceId;
  name: string;
  market: SourceMarket;
  url: string;
  beta?: true;
  /** Rarely relevant for the target audience (measured share of good matches); off by default, still selectable. */
  lowYield?: true;
  requiresKey?: string;
  /** The board's apply button needs a paid subscription; point users to the company site. */
  applyPaywall?: true;
};

export const SOURCE_CATALOG: readonly SourceInfo[] = [
  { id: 'dou', name: 'DOU', market: 'ua', url: 'https://jobs.dou.ua' },
  { id: 'djinni', name: 'Djinni', market: 'ua', url: 'https://djinni.co' },
  { id: 'robotaua', name: 'robota.ua', market: 'ua', url: 'https://robota.ua' },
  { id: 'itlead', name: 'ITLead', market: 'ua', url: 'https://itlead.org/vacancies' },
  // Aggregator: many listings are already closed on the employer side (its pages block checks), short snippets.
  { id: 'jooble', name: 'Jooble', market: 'global', url: 'https://jooble.org', requiresKey: 'JOOBLE_API_KEY', lowYield: true },
  { id: 'linkedin', name: 'LinkedIn', market: 'global', url: 'https://www.linkedin.com/jobs' },
  // Applying needs a paid Remote OK membership.
  { id: 'remoteok', name: 'Remote OK', market: 'remote', url: 'https://remoteok.com', applyPaywall: true, lowYield: true },
  { id: 'remotive', name: 'Remotive', market: 'remote', url: 'https://remotive.com' },
  { id: 'himalayas', name: 'Himalayas', market: 'remote', url: 'https://himalayas.app' },
  { id: 'workingnomads', name: 'Working Nomads', market: 'remote', url: 'https://www.workingnomads.com' },
  { id: 'hn', name: "HN Who's Hiring", market: 'remote', url: 'https://news.ycombinator.com' },
  { id: 'telegram', name: 'Telegram channels', market: 'ua', url: 'https://t.me' },
  { id: 'greenhouse', name: 'Greenhouse boards', market: 'global', url: 'https://www.greenhouse.com' },
  { id: 'lever', name: 'Lever boards', market: 'global', url: 'https://www.lever.co' },
  { id: 'ashby', name: 'Ashby boards', market: 'global', url: 'https://www.ashbyhq.com' },
  { id: 'workable', name: 'Workable boards', market: 'global', url: 'https://www.workable.com' },
];

const BY_ID = new Map<string, SourceInfo>(SOURCE_CATALOG.map((s) => [s.id, s]));

export function sourceInfo(id: string): SourceInfo | undefined {
  return BY_ID.get(id);
}

/** The boards most good matches come from; shown first and picked by "Use recommended". */
export const MAIN_SOURCE_IDS: readonly SourceId[] = ['dou', 'djinni', 'robotaua'];

/**
 * Fallback for profiles saved before sources were chosen explicitly (new profiles start with none checked). The
 * argument is kept for callers; the main boards cover office, hybrid and remote searches alike.
 */
export function defaultSources(_remoteType?: 'any' | 'remote' | 'hybrid' | 'office'): SourceId[] {
  return [...MAIN_SOURCE_IDS];
}

/** Sources polled per board/channel from source_boards rather than per search keyword. */
export const BOARD_SOURCE_IDS: ReadonlySet<SourceId> = new Set<SourceId>(['greenhouse', 'lever', 'ashby', 'workable', 'telegram']);

/**
 * Sources that return everything a company (or a thread/channel) posts, not search results: only jobs some
 * active profile wants are stored from them.
 */
export const PREFILTERED_SOURCE_IDS: ReadonlySet<SourceId> = new Set<SourceId>([...BOARD_SOURCE_IDS, 'hn']);

/**
 * Where most good matches come from (measured): polled on their own interval, never slowed by the cost multiplier,
 * so the feed is fresh where it matters.
 */
export const PRIORITY_SOURCE_IDS: ReadonlySet<SourceId> = new Set<SourceId>(MAIN_SOURCE_IDS);

