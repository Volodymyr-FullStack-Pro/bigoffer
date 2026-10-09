import { z } from 'zod';
import { SENIORITIES, SOURCE_IDS, type SourceId } from './job';
import { ROLE_FAMILIES } from './roles';
import { BROWSER_SOURCE_IDS, defaultSources } from './sources';

export function parseList(text: string, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const value = part.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

export const SEARCH_REMOTE_TYPES = ['any', 'remote', 'hybrid', 'office'] as const;

const term = z.string().trim().min(1).max(60);

export const searchProfileInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  keywords: z.array(term).min(1).max(5),
  /** Job families to show; empty = derived from the keywords (see targetRoleFamilies). */
  targetRoles: z.array(z.enum(ROLE_FAMILIES)).max(ROLE_FAMILIES.length).default([]),
  skills: z.array(term).max(30),
  excludeKeywords: z.array(term).max(30),
  seniority: z.array(z.enum(SENIORITIES)),
  locations: z.array(term).max(10),
  remoteType: z.enum(SEARCH_REMOTE_TYPES),
  salaryMinUsd: z.number().int().min(0).max(100_000).nullable(),
  sources: z.array(z.enum(SOURCE_IDS)).min(1).max(30),
  isActive: z.boolean(),
});

export type SearchProfileInput = z.infer<typeof searchProfileInputSchema>;
export type SearchProfile = Omit<SearchProfileInput, 'id' | 'name' | 'isActive' | 'sources'> & {
  id: string;
  userId: string;
  sources: SourceId[] | null;
  /** Owner's country of residence (profiles.country, ISO alpha-2): remote jobs restricted elsewhere are hidden. */
  candidateCountry?: string | null;
};

export type SourceQuerySpec = { sourceId: SourceId; params: Record<string, string>; queryKey: string };

/** Djinni categories queried per profile (keywords first). */
const MAX_DJINNI_CATEGORIES = 4;

export const DJINNI_PRIMARY_KEYWORDS: Record<string, string> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'JavaScript',
  'full stack': 'Fullstack',
  fullstack: 'Fullstack',
  'full-stack': 'Fullstack',
  frontend: 'JavaScript',
  'front end': 'JavaScript',
  'front-end': 'JavaScript',
  vue: 'Vue.js',
  'vue.js': 'Vue.js',
  nuxt: 'Vue.js',
  angular: 'Angular',
  react: 'React.js',
  'react.js': 'React.js',
  'next.js': 'React.js',
  node: 'Node.js',
  'node.js': 'Node.js',
  nestjs: 'Node.js',
  python: 'Python',
  java: 'Java',
  php: 'PHP',
  golang: 'Golang',
  go: 'Golang',
  ruby: 'Ruby',
  ios: 'iOS',
  android: 'Android',
  flutter: 'Flutter',
  devops: 'DevOps',
  qa: 'QA',
  'project manager': 'Project Manager',
  'product manager': 'Product Manager',
  designer: 'Design',
  marketing: 'Marketing',
  sales: 'Sales',
  hr: 'HR',
  recruiter: 'HR',
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DJINNI_TERMS_LONGEST_FIRST = Object.keys(DJINNI_PRIMARY_KEYWORDS)
  .sort((a, b) => b.length - a.length)
  .map((key) => ({ key, re: new RegExp(`(?<![\\p{L}\\p{N}.#+-])${escapeRegExp(key)}(?![\\p{L}\\p{N}#+-])`, 'u') }));

/** Djinni categories for one keyword/skill: exact lookup, else every known term contained as whole words (longest first). */
function djinniCategories(raw: string): string[] {
  const t = raw.trim().toLowerCase();
  const exact = DJINNI_PRIMARY_KEYWORDS[t];
  if (exact) return [exact];
  const found: string[] = [];
  let rest = t;
  for (const { key, re } of DJINNI_TERMS_LONGEST_FIRST) {
    if (!re.test(rest)) continue;
    found.push(DJINNI_PRIMARY_KEYWORDS[key]!);
    rest = rest.replace(re, ' ');
  }
  return found;
}

const SEARCH_SOURCES: [SourceId, string][] = [
  ['dou', 'search'],
  ['robotaua', 'keyWords'],
  ['jooble', 'keywords'],
  ['remotive', 'search'],
  ['himalayas', 'q'],
  ['workua', 'search'],
  ['olx', 'search'],
  ['jobicy', 'tag'],
];

const MAX_TERMS = 6;
/** Job-title variants that job boards match better than bare technology names. */
const TITLE_VARIANTS: [RegExp, string[]][] = [
  [/^full ?-?stack$/, ['full stack developer']],
  [/^react(\.js)?$/, ['react developer', 'frontend developer']],
  [/^front ?-?end$/, ['frontend developer']],
  [/^node(\.js)?$/, ['node.js developer']],
  [/^next(\.js)?$/, ['next.js developer']],
  [/^(javascript|js)$/, ['javascript developer']],
  [/^(typescript|ts)$/, ['typescript developer']],
];

/** Search terms for keyword-based sources: the profile's keywords first, then title variants of keywords and skills. */
export function searchTerms(profile: Pick<SearchProfile, 'keywords' | 'skills'>): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  };
  for (const k of profile.keywords) push(k);
  for (const t of [...profile.keywords, ...profile.skills]) {
    const key = t.trim().toLowerCase();
    for (const [re, variants] of TITLE_VARIANTS) if (re.test(key)) variants.forEach(push);
  }
  return out.slice(0, MAX_TERMS);
}

export const ADZUNA_COUNTRIES = ['pl', 'de', 'gb', 'nl'] as const;

export function queryKey(sourceId: SourceId, params: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]!]),
  );
  return `${sourceId}:${JSON.stringify(sorted)}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildSourceQueries(
  profile: Pick<SearchProfile, 'keywords' | 'skills' | 'remoteType' | 'sources'>,
): SourceQuerySpec[] {
  const enabled = new Set<SourceId>(profile.sources ?? defaultSources(profile.remoteType));
  const remote = profile.remoteType === 'remote';
  const keywords = searchTerms(profile);
  const specs: SourceQuerySpec[] = [];
  const add = (sourceId: SourceId, params: Record<string, string>) => {
    if (enabled.has(sourceId)) specs.push({ sourceId, params, queryKey: queryKey(sourceId, params) });
  };

  for (const [sourceId, param] of SEARCH_SOURCES) {
    // Browser sources are the most expensive to run, so they get only the first two terms (like Adzuna).
    for (const keyword of BROWSER_SOURCE_IDS.has(sourceId) ? keywords.slice(0, 2) : keywords) {
      add(sourceId, sourceId === 'workua' && remote ? { [param]: keyword, remote: '1' } : { [param]: keyword });
    }
  }
  for (const keyword of keywords) {
    add(
      'linkedin',
      remote ? { keywords: keyword, location: 'Worldwide', remote: '1' } : { keywords: keyword, location: 'Ukraine' },
    );
  }
  for (const term of keywords.slice(0, 2)) {
    for (const country of ADZUNA_COUNTRIES) add('adzuna', { what: `${term} remote`, country });
  }

  const terms = [...profile.keywords, ...profile.skills].map((t) => t.toLowerCase());
  const has = (re: RegExp) => terms.some((t) => re.test(t));
  const categories = [
    has(/front|react|vue|angular|\bnext\b|full ?stack|javascript|typescript/) ? 'Front End' : null,
    has(/node|nest|express|full ?stack|back ?end/) ? 'Node.js' : null,
    has(/javascript|typescript|full ?stack/) ? 'JavaScript' : null,
  ].filter((c): c is string => c !== null);
  for (const category of categories) add('dou', { category });

  const djinni = [
    ...new Set([...profile.keywords, ...profile.skills].flatMap((t) => djinniCategories(t))),
  ].slice(0, MAX_DJINNI_CATEGORIES);
  if (djinni.length === 0) add('djinni', {});
  for (const primary of djinni) add('djinni', { primary_keyword: primary });

  const tagSource = profile.skills[0] ?? profile.keywords[0];
  const tag = tagSource ? slug(tagSource) : '';
  add('remoteok', tag ? { tag } : {});
  add('wwr', {});
  add('hn', {});
  add('arbeitnow', {});
  add('workingnomads', {});
  add('justjoin', {});
  add('jobico', {});
  add('itlead', {});

  const unique = new Map(specs.map((s) => [s.queryKey, s]));
  return [...unique.values()];
}
