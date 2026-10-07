import { decodeEntities } from './text';

import type { RemoteType } from './job';

const COMPANY_SUFFIXES = new Set([
  'llc', 'inc', 'ltd', 'gmbh', 'corp', 'corporation', 'co', 'plc', 'sa', 'bv',
  'тов', 'ооо', 'фоп', 'пп', 'тзов',
]);

/** Language names whose symbols would otherwise be stripped and collapse into "c" / "net". */
function canonicalizeSymbols(s: string): string {
  return s
    .replace(/(?<![\p{L}\p{N}])c\+\+/gu, ' cplusplus ')
    .replace(/(?<![\p{L}\p{N}])c#/gu, ' csharp ')
    .replace(/(?<![\p{L}\p{N}])f#/gu, ' fsharp ')
    .replace(/\.net(?![\p{L}\p{N}])/gu, ' dotnet ');
}

function tokens(s: string): string[] {
  return canonicalizeSymbols(decodeEntities(s).normalize('NFC').toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function normalizeCompany(name: string): string {
  return tokens(name)
    .filter((t) => !COMPANY_SUFFIXES.has(t))
    .join(' ');
}

export function normalizeTitle(title: string): string {
  return tokens(title).join(' ');
}

const CITY_BUCKETS: Record<string, string[]> = {
  kyiv: ['kyiv', 'kiev', 'київ', 'киев'],
  lviv: ['lviv', 'львів', 'львов'],
  kharkiv: ['kharkiv', 'харків', 'харьков'],
  odesa: ['odesa', 'odessa', 'одеса', 'одесса'],
  dnipro: ['dnipro', 'дніпро', 'днепр'],
};

export function regionBucket(location: string | null, remoteType: RemoteType): string {
  if (remoteType === 'remote') return 'remote';
  if (!location) return 'unknown';
  const words = new Set(tokens(location));
  for (const [bucket, names] of Object.entries(CITY_BUCKETS)) {
    if (names.some((n) => words.has(n))) return bucket;
  }
  return tokens(location).join(' ') || 'unknown';
}

export async function fingerprint(input: { company: string; title: string; region: string }): Promise<string> {
  const key = `${normalizeCompany(input.company)}|${normalizeTitle(input.title)}|${input.region}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
