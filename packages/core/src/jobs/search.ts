import { z } from 'zod';
import { SENIORITIES, SOURCE_IDS, type SourceId } from './job';
import { isFrontendKeyword, keywordSearchVariants } from './keywords';
import { ROLE_FAMILIES } from './roles';
import { defaultSources } from './sources';

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

/** Job titles a search profile may list (each is searched on DOU and robota.ua). */
export const MAX_KEYWORDS = 15;

export const searchProfileInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  keywords: z.array(term).min(1).max(MAX_KEYWORDS),
  /** Job families to show; empty = derived from the keywords (see targetRoleFamilies). */
  targetRoles: z.array(z.enum(ROLE_FAMILIES)).max(ROLE_FAMILIES.length).default([]),
  skills: z.array(term).max(100),
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
  'react native': 'React Native',
  'react-native': 'React Native',
  expo: 'React Native',
  ios: 'iOS',
  android: 'Android',
  flutter: 'Flutter',
  dart: 'Flutter',
  markup: 'Markup',
  'html/css': 'Markup',
  верстальник: 'Markup',
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
];

// Keywords first, then their spellings and title variants; at most this many searches per board and profile.
const MAX_TERMS = 18;
/** Job-title variants that job boards match better than bare technology names. */
// Bare role words also search their usual job titles; other spellings come from keywordSearchVariants.
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
  // Other spellings next ("front-end", "фронтенд"): boards' text search does not treat them as the same word.
  for (const k of profile.keywords) keywordSearchVariants(k).forEach(push);
  for (const t of [...profile.keywords, ...profile.skills]) {
    const key = t.trim().toLowerCase();
    for (const [re, variants] of TITLE_VARIANTS) if (re.test(key)) variants.forEach(push);
  }
  return out.slice(0, MAX_TERMS);
}

export function queryKey(sourceId: SourceId, params: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]!]),
  );
  return `${sourceId}:${JSON.stringify(sorted)}`;
}

export function buildSourceQueries(
  profile: Pick<SearchProfile, 'keywords' | 'skills' | 'remoteType' | 'sources'>,
): SourceQuerySpec[] {
  const enabled = new Set<SourceId>(profile.sources ?? defaultSources(profile.remoteType));
  const keywords = searchTerms(profile);
  const specs: SourceQuerySpec[] = [];
  const add = (sourceId: SourceId, params: Record<string, string>) => {
    if (enabled.has(sourceId)) specs.push({ sourceId, params, queryKey: queryKey(sourceId, params) });
  };

  for (const [sourceId, param] of SEARCH_SOURCES) {
    for (const keyword of keywords) add(sourceId, { [param]: keyword });
  }

  const terms = [...profile.keywords, ...profile.skills].map((t) => t.toLowerCase());
  const has = (re: RegExp) => terms.some((t) => re.test(t));
  const categories = [
    has(/front|react|vue|angular|\bnext\b|full ?stack|javascript|typescript/) ? 'Front End' : null,
    has(/node|nest|express|full ?stack|back ?end/) ? 'Node.js' : null,
    has(/javascript|typescript|full ?stack/) ? 'JavaScript' : null,
    has(/\bqa\b|\baqa\b|tester|testing|test automation|sdet|тестувальник|тестировщик/) ? 'QA' : null,
    has(/python|django|fastapi/) ? 'Python' : null,
    has(/\bjava\b|spring|kotlin/) ? 'Java' : null,
    has(/\.net|c#|asp\.net/) ? '.NET' : null,
    has(/devops|\bsre\b|kubernetes|terraform/) ? 'DevOps' : null,
    // DOU has no React Native / Flutter category: cross-platform jobs are filed under iOS and Android.
    has(/\bios\b|swift|react[\s-]?native|flutter/) ? 'iOS/macOS' : null,
    has(/android|kotlin|react[\s-]?native|flutter/) ? 'Android' : null,
    has(/designer|ui\/ux|\bux\b|figma/) ? 'Design' : null,
    has(/project manager/) ? 'Project Manager' : null,
    has(/product manager/) ? 'Product Manager' : null,
    has(/data (scientist|engineer|analyst)|machine learning/) ? 'Data Science' : null,
  ].filter((c): c is string => c !== null);
  for (const category of categories) add('dou', { category });

  const djinni = [
    ...new Set([
      ...[...profile.keywords, ...profile.skills].flatMap((t) => djinniCategories(t)),
      // Markup (HTML/CSS) postings are front-end work as well.
      ...(profile.keywords.some(isFrontendKeyword) ? ['Markup'] : []),
    ]),
  ].slice(0, MAX_DJINNI_CATEGORIES);
  if (djinni.length === 0) add('djinni', {});
  for (const primary of djinni) add('djinni', { primary_keyword: primary });

  const unique = new Map(specs.map((s) => [s.queryKey, s]));
  return [...unique.values()];
}
