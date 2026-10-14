import type { SourceId } from './job';

export type SourceInfo = {
  id: SourceId;
  name: string;
  url: string;
};

/** The Ukrainian boards almost every good match and application came from (measured in production). */
export const SOURCE_CATALOG: readonly SourceInfo[] = [
  { id: 'dou', name: 'DOU', url: 'https://jobs.dou.ua' },
  { id: 'djinni', name: 'Djinni', url: 'https://djinni.co' },
  { id: 'robotaua', name: 'robota.ua', url: 'https://robota.ua' },
];

const BY_ID = new Map<string, SourceInfo>(SOURCE_CATALOG.map((s) => [s.id, s]));

export function sourceInfo(id: string): SourceInfo | undefined {
  return BY_ID.get(id);
}

/** Picked by "Use main boards". */
export const MAIN_SOURCE_IDS: readonly SourceId[] = ['dou', 'djinni', 'robotaua'];

/**
 * Fallback for profiles saved before sources were chosen explicitly (new profiles start with none checked). The
 * argument is kept for callers; the main boards cover office, hybrid and remote searches alike.
 */
export function defaultSources(_remoteType?: 'any' | 'remote' | 'hybrid' | 'office'): SourceId[] {
  return [...MAIN_SOURCE_IDS];
}

const DJINNI = /^https:\/\/djinni\.co\/jobs\/(\d+)-[^/?#]*\/?/i;
const DOU = /^https:\/\/jobs\.dou\.ua\/companies\/[^/]+\/vacancies\/(\d+)\/?/i;
const ROBOTA = /^https:\/\/(?:www\.)?robota\.ua\/(?:[a-z]{2}\/)?company\d+\/vacancy(\d+)/i;

/** The board a vacancy link belongs to, with its canonical url; null for any other site. */
export function boardLink(raw: string): { sourceId: SourceId; url: string; id: string } | null {
  const url = raw.trim().replace(/^http:/i, 'https:').replace(/^https:\/\/www\.djinni/i, 'https://djinni');
  for (const [sourceId, re] of [['djinni', DJINNI], ['dou', DOU], ['robotaua', ROBOTA]] as const) {
    const m = re.exec(url);
    if (m) return { sourceId, url: m[0].endsWith('/') || sourceId === 'robotaua' ? m[0] : `${m[0]}/`, id: m[1]! };
  }
  return null;
}

