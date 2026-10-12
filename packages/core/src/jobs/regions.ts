/** Where a remote employer hires. AI enrichment returns these codes or ISO 3166-1 alpha-2 country codes. */
export const REMOTE_REGIONS = [
  'worldwide', 'europe', 'eu', 'cee', 'uk', 'north_america', 'us', 'canada', 'latam', 'apac', 'mena', 'africa',
] as const;
export type RemoteRegion = (typeof REMOTE_REGIONS)[number];

const EU = ['eu', 'europe'] as const satisfies readonly RemoteRegion[];
const EU_CEE = ['eu', 'europe', 'cee'] as const satisfies readonly RemoteRegion[];

/** Countries a user can pick as their residence, with the hiring regions each belongs to. */
export const COUNTRY_REGIONS: Readonly<Record<string, readonly RemoteRegion[]>> = {
  UA: ['europe', 'cee'],
  MD: ['europe', 'cee'],
  PL: EU_CEE, CZ: EU_CEE, SK: EU_CEE, HU: EU_CEE, RO: EU_CEE, BG: EU_CEE,
  LT: EU_CEE, LV: EU_CEE, EE: EU_CEE, HR: EU_CEE, SI: EU_CEE,
  DE: EU, AT: EU, NL: EU, BE: EU, LU: EU, FR: EU, ES: EU, PT: EU, IT: EU,
  IE: EU, DK: EU, SE: EU, FI: EU, GR: EU, CY: EU, MT: EU,
  GB: ['uk', 'europe'],
  CH: ['europe'],
  NO: ['europe'],
  US: ['us', 'north_america'],
  CA: ['canada', 'north_america'],
  MX: ['latam', 'north_america'],
  BR: ['latam'], AR: ['latam'], CO: ['latam'],
  IN: ['apac'], AU: ['apac'], SG: ['apac'],
  AE: ['mena'], IL: ['mena'], TR: ['europe', 'mena'],
  ZA: ['africa'], EG: ['africa', 'mena'],
};

export const COUNTRY_CODES: readonly string[] = Object.keys(COUNTRY_REGIONS).sort();

export function isCountryCode(v: unknown): v is string {
  return typeof v === 'string' && Object.hasOwn(COUNTRY_REGIONS, v);
}

/** Region codes lowercased (`"North America"` → `north_america`), anything two-letter as an upper-case country. */
export function normalizeRemoteRegions(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if ((REMOTE_REGIONS as readonly string[]).includes(key)) out.add(key);
    else if (/^[a-z]{2}$/.test(key)) out.add(key.toUpperCase());
  }
  return [...out];
}

/** True when a remote job names the regions it hires from and none of them covers `country`. */
export function remoteBlockedFor(regions: readonly string[], country: string | null | undefined): boolean {
  if (!country || regions.length === 0 || regions.includes('worldwide')) return false;
  const mine: readonly string[] | undefined = COUNTRY_REGIONS[country];
  if (!mine) return false;
  return !regions.some((r) => r === country || mine.includes(r));
}
