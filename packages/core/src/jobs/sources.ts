import type { SourceId } from './job';

export type SourceMarket = 'ua' | 'remote' | 'europe' | 'global';

export type SourceInfo = {
  id: SourceId;
  name: string;
  market: SourceMarket;
  url: string;
  beta?: true;
  requiresKey?: string;
  browser?: true;
};

export const SOURCE_CATALOG: readonly SourceInfo[] = [
  { id: 'dou', name: 'DOU', market: 'ua', url: 'https://jobs.dou.ua' },
  { id: 'djinni', name: 'Djinni', market: 'ua', url: 'https://djinni.co' },
  { id: 'workua', name: 'Work.ua', market: 'ua', url: 'https://www.work.ua', browser: true },
  { id: 'robotaua', name: 'robota.ua', market: 'ua', url: 'https://robota.ua' },
  { id: 'olx', name: 'OLX Робота', market: 'ua', url: 'https://www.olx.ua/uk/rabota/', browser: true },
  { id: 'jooble', name: 'Jooble', market: 'global', url: 'https://jooble.org', requiresKey: 'JOOBLE_API_KEY' },
  { id: 'linkedin', name: 'LinkedIn', market: 'global', url: 'https://www.linkedin.com/jobs', beta: true },
  { id: 'remoteok', name: 'Remote OK', market: 'remote', url: 'https://remoteok.com' },
  { id: 'remotive', name: 'Remotive', market: 'remote', url: 'https://remotive.com' },
  { id: 'himalayas', name: 'Himalayas', market: 'remote', url: 'https://himalayas.app' },
  { id: 'wwr', name: 'We Work Remotely', market: 'remote', url: 'https://weworkremotely.com' },
  { id: 'jobicy', name: 'Jobicy', market: 'remote', url: 'https://jobicy.com' },
  { id: 'workingnomads', name: 'Working Nomads', market: 'remote', url: 'https://www.workingnomads.com' },
  { id: 'hn', name: "HN Who's Hiring", market: 'remote', url: 'https://news.ycombinator.com' },
  { id: 'arbeitnow', name: 'Arbeitnow', market: 'europe', url: 'https://www.arbeitnow.com' },
  { id: 'justjoin', name: 'Just Join IT', market: 'europe', url: 'https://justjoin.it' },
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
  return SOURCE_CATALOG.filter((s) => !s.beta && markets.includes(s.market)).map((s) => s.id);
}
