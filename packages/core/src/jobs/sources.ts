import type { SourceId } from './job';

export type SourceMarket = 'ua' | 'remote' | 'europe' | 'global';

export type SourceInfo = {
  id: SourceId;
  name: string;
  market: SourceMarket;
  url: string;
  beta?: true;
  /** Rarely relevant for the target audience (measured share of good matches); off by default, still selectable. */
  lowYield?: true;
  requiresKey?: string;
  browser?: true;
  /** The board's apply button needs a paid subscription; point users to the company site. */
  applyPaywall?: true;
};

export const SOURCE_CATALOG: readonly SourceInfo[] = [
  { id: 'dou', name: 'DOU', market: 'ua', url: 'https://jobs.dou.ua' },
  { id: 'djinni', name: 'Djinni', market: 'ua', url: 'https://djinni.co' },
  // Answers HTTP 403 to every non-browser-fingerprinted client (incl. our cloud workers), so it never yields.
  { id: 'workua', name: 'Work.ua', market: 'ua', url: 'https://www.work.ua', browser: true, lowYield: true },
  { id: 'robotaua', name: 'robota.ua', market: 'ua', url: 'https://robota.ua' },
  { id: 'jobico', name: 'Jobico', market: 'ua', url: 'https://www.jobico.io', lowYield: true },
  { id: 'itlead', name: 'ITLead', market: 'ua', url: 'https://itlead.org/vacancies' },
  { id: 'olx', name: 'OLX Робота', market: 'ua', url: 'https://www.olx.ua/uk/rabota/', browser: true, lowYield: true },
  // Aggregator: many listings are already closed on the employer side (its pages block checks), short snippets.
  { id: 'jooble', name: 'Jooble', market: 'global', url: 'https://jooble.org', requiresKey: 'JOOBLE_API_KEY', lowYield: true },
  { id: 'adzuna', name: 'Adzuna', market: 'europe', url: 'https://www.adzuna.com', requiresKey: 'ADZUNA_APP_ID' },
  { id: 'linkedin', name: 'LinkedIn', market: 'global', url: 'https://www.linkedin.com/jobs', beta: true },
  // Applying needs a paid Remote OK membership.
  { id: 'remoteok', name: 'Remote OK', market: 'remote', url: 'https://remoteok.com', applyPaywall: true, lowYield: true },
  { id: 'remotive', name: 'Remotive', market: 'remote', url: 'https://remotive.com' },
  { id: 'himalayas', name: 'Himalayas', market: 'remote', url: 'https://himalayas.app' },
  { id: 'wwr', name: 'We Work Remotely', market: 'remote', url: 'https://weworkremotely.com', lowYield: true },
  { id: 'jobicy', name: 'Jobicy', market: 'remote', url: 'https://jobicy.com', lowYield: true },
  { id: 'workingnomads', name: 'Working Nomads', market: 'remote', url: 'https://www.workingnomads.com' },
  { id: 'hn', name: "HN Who's Hiring", market: 'remote', url: 'https://news.ycombinator.com' },
  { id: 'arbeitnow', name: 'Arbeitnow', market: 'europe', url: 'https://www.arbeitnow.com', lowYield: true },
  { id: 'justjoin', name: 'Just Join IT', market: 'europe', url: 'https://justjoin.it', lowYield: true },
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

export const BROWSER_SOURCE_IDS: ReadonlySet<SourceId> = new Set(
  SOURCE_CATALOG.filter((s) => s.browser).map((s) => s.id),
);

export function defaultSources(remoteType: 'any' | 'remote' | 'hybrid' | 'office'): SourceId[] {
  const markets: SourceMarket[] =
    remoteType === 'office' || remoteType === 'hybrid' ? ['ua', 'global'] : ['ua', 'remote', 'europe', 'global'];
  return SOURCE_CATALOG.filter((s) => !s.beta && !s.lowYield && markets.includes(s.market)).map((s) => s.id);
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
export const PRIORITY_SOURCE_IDS: ReadonlySet<SourceId> = new Set<SourceId>(['dou', 'djinni', 'robotaua']);

