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
