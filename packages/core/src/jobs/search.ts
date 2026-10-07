import { z } from 'zod';
import { SENIORITIES, type SourceId } from './job';

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
  skills: z.array(term).max(30),
  excludeKeywords: z.array(term).max(30),
  seniority: z.array(z.enum(SENIORITIES)),
  locations: z.array(term).max(10),
  remoteType: z.enum(SEARCH_REMOTE_TYPES),
  salaryMinUsd: z.number().int().min(0).max(100_000).nullable(),
  isActive: z.boolean(),
});

export type SearchProfileInput = z.infer<typeof searchProfileInputSchema>;
export type SearchProfile = Omit<SearchProfileInput, 'id' | 'name' | 'isActive'> & {
  id: string;
  userId: string;
};

export type SourceQuerySpec = { sourceId: SourceId; params: Record<string, string>; queryKey: string };

export const DJINNI_PRIMARY_KEYWORDS: Record<string, string> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'JavaScript',
  react: 'React.js',
  'react.js': 'React.js',
  'next.js': 'React.js',
  node: 'Node.js',
  'node.js': 'Node.js',
  nestjs: 'Node.js',
  python: 'Python',
  java: 'Java',
  php: 'PHP',
  'c#': 'C# / .NET',
  '.net': 'C# / .NET',
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

const SEARCH_SOURCES: [SourceId, string][] = [
  ['dou', 'search'],
  ['robotaua', 'keyWords'],
  ['jooble', 'keywords'],
  ['remotive', 'search'],
  ['himalayas', 'q'],
];

function queryKey(sourceId: SourceId, params: Record<string, string>): string {
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

export function buildSourceQueries(profile: Pick<SearchProfile, 'keywords' | 'skills'>): SourceQuerySpec[] {
  const keywords = profile.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 3);
  const specs: SourceQuerySpec[] = [];
  const add = (sourceId: SourceId, params: Record<string, string>) => {
    specs.push({ sourceId, params, queryKey: queryKey(sourceId, params) });
  };

  for (const [sourceId, param] of SEARCH_SOURCES) {
    for (const keyword of keywords) add(sourceId, { [param]: keyword });
  }

  const djinni = [
    ...new Set(
      [...profile.skills, ...profile.keywords]
        .map((t) => DJINNI_PRIMARY_KEYWORDS[t.trim().toLowerCase()])
        .filter((v): v is string => Boolean(v)),
    ),
  ].slice(0, 2);
  if (djinni.length === 0) add('djinni', {});
  for (const primary of djinni) add('djinni', { primary_keyword: primary });

  const tagSource = profile.skills[0] ?? profile.keywords[0];
  const tag = tagSource ? slug(tagSource) : '';
  add('remoteok', tag ? { tag } : {});
  add('wwr', {});
  add('hn', {});

  const unique = new Map(specs.map((s) => [s.queryKey, s]));
  return [...unique.values()];
}
