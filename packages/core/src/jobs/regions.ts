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

let countryNames: Map<string, string> | undefined;

/** English country name → ISO alpha-2 (built from Intl, plus common aliases). */
export function countryCodeFromName(name: string): string | null {
  if (!countryNames) {
    countryNames = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        let label: string | undefined;
        try {
          label = names.of(code);
        } catch {
          continue;
        }
        if (label && label !== code) {
          countryNames.set(label.toLowerCase(), code);
          countryNames.set(label.toLowerCase().replace(/ & /g, ' and '), code);
        }
      }
    }
    const aliases: Record<string, string> = {
      usa: 'US', us: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US', 'united states of america': 'US',
      'czech republic': 'CZ', uae: 'AE', 'south korea': 'KR', russia: 'RU', vietnam: 'VN', turkey: 'TR', türkiye: 'TR',
    };
    for (const [k, v] of Object.entries(aliases)) countryNames.set(k, v);
  }
  return countryNames.get(name.trim().toLowerCase()) ?? null;
}

const WORLDWIDE = /^(worldwide|world ?wide|anywhere|global|the world|anywhere in the world|world)$/;
const REGION_ALIASES: Record<string, RemoteRegion> = {
  europe: 'europe', emea: 'europe', eu: 'eu', 'european union': 'eu', cee: 'cee', 'eastern europe': 'cee', 'central europe': 'cee',
  uk: 'uk', 'united kingdom': 'uk', 'great britain': 'uk', 'north america': 'north_america', latam: 'latam', 'latin america': 'latam',
  'south america': 'latam', apac: 'apac', asia: 'apac', 'asia pacific': 'apac', mena: 'mena', 'middle east': 'mena', africa: 'africa',
};

/**
 * Where a remote hire may live, from a job board's location field ("USA", "Canada, USA", "Anywhere in India",
 * or a list of country names). Returns [] when any part is not understood: no restriction is better than a wrong one.
 */
export function regionsFromLocation(location: string | readonly string[]): string[] {
  const parts = (typeof location === 'string' ? location.split(/[,;/|]|\s+or\s+|\s+and\s+/i) : [...location])
    .map((p) => p.toLowerCase().replace(/[()]/g, ' ').replace(/\b(only|remote|based)\b/g, ' ').replace(/^\s*anywhere in\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.some((p) => WORLDWIDE.test(p))) return ['worldwide'];
  const out = new Set<string>();
  for (const part of parts) {
    const region = REGION_ALIASES[part];
    const code = region ? null : countryCodeFromName(part);
    if (region) out.add(region);
    else if (code) out.add(code);
    else return [];
  }
  return [...out];
}
