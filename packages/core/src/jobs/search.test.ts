import type { SourceId } from './job';
import { describe, expect, it } from 'vitest';
import { buildSourceQueries, DJINNI_PRIMARY_KEYWORDS, parseList, searchProfileInputSchema, searchTerms } from './search';

describe('parseList', () => {
  it('splits, trims and dedupes case-insensitively', () => {
    expect(parseList('React, node.js\nReact ,, TypeScript')).toEqual(['React', 'node.js', 'TypeScript']);
  });
  it('respects max', () => {
    expect(parseList('a,b,c', 2)).toEqual(['a', 'b']);
  });
});

describe('searchProfileInputSchema', () => {
  it('accepts a valid profile', () => {
    const r = searchProfileInputSchema.safeParse({
      name: 'Full-Stack remote',
      keywords: ['full stack', 'react developer'],
      skills: ['React', 'Node.js'],
      excludeKeywords: ['1C'],
      seniority: ['middle', 'senior'],
      locations: [],
      remoteType: 'remote',
      salaryMinUsd: 3000,
      sources: ['dou', 'djinni'],
      isActive: true,
    });
    expect(r.success).toBe(true);
  });
  it('requires at least one keyword', () => {
    const r = searchProfileInputSchema.safeParse({
      name: 'x', keywords: [], skills: [], excludeKeywords: [], seniority: [], locations: [],
      remoteType: 'any', salaryMinUsd: null, sources: ['dou'], isActive: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('buildSourceQueries', () => {
  const specs = buildSourceQueries({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'], remoteType: 'any', sources: ['dou', 'djinni', 'robotaua', 'himalayas', 'hn'] });
  const bySource = (id: string) => specs.filter((s) => s.sourceId === id);
  const withLowYield = buildSourceQueries({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'], remoteType: 'any', sources: ['wwr', 'hn', 'remoteok'] });

  it('creates one query per keyword for search sources', () => {
    expect(bySource('dou').map((s) => s.params).filter((p) => p.search)).toEqual(
      searchTerms({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'] }).map((search) => ({ search })),
    );
    expect(bySource('dou').filter((s) => s.params.search)).toHaveLength(8);
    expect(bySource('robotaua')).toHaveLength(8);
    expect(bySource('himalayas')[0]!.params).toEqual({ q: 'full stack' });
  });
  it('maps skills to djinni primary keywords', () => {
    expect(bySource('djinni').map((s) => s.params)).toEqual([
      { primary_keyword: 'Fullstack' },
      { primary_keyword: 'React.js' },
      { primary_keyword: 'Node.js' },
    ]);
  });
  it('uses a slug tag for remoteok and no params for feeds', () => {
    expect(withLowYield.find((s) => s.sourceId === 'remoteok')!.params).toEqual({ tag: 'react' });
    expect(withLowYield.find((s) => s.sourceId === 'wwr')!.params).toEqual({});
    expect(bySource('hn')[0]!.params).toEqual({});
  });
  it('builds deterministic unique query keys', () => {
    expect(bySource('dou')[0]!.queryKey).toBe('dou:{"search":"full stack"}');
    expect(new Set(specs.map((s) => s.queryKey)).size).toBe(specs.length);
  });
});

describe('buildSourceQueries with source selection', () => {
  const base = { keywords: ['full stack'], skills: ['React'], remoteType: 'remote' as const };

  it('only builds queries for selected sources', () => {
    const specs = buildSourceQueries({ ...base, sources: ['dou', 'workua'] });
    expect([...new Set(specs.map((s) => s.sourceId))].sort()).toEqual(['dou', 'workua']);
  });

  it('falls back to defaults when sources is null', () => {
    const ids = new Set(buildSourceQueries({ ...base, sources: null }).map((s) => s.sourceId));
    expect([...ids].sort()).toEqual(['djinni', 'dou', 'linkedin', 'robotaua']);
  });

  it('builds params for new sources', () => {
    const specs = buildSourceQueries({
      ...base,
      sources: ['workua', 'olx', 'linkedin', 'jobicy', 'arbeitnow', 'workingnomads', 'justjoin', 'jobico', 'itlead'],
    });
    const p = (id: string) => specs.filter((s) => s.sourceId === id).map((s) => s.params);
    expect(p('workua')[0]).toEqual({ search: 'full stack', remote: '1' });
    expect(p('olx')[0]).toEqual({ search: 'full stack' });
    expect(p('linkedin')[0]).toEqual({ keywords: 'full stack', location: 'Worldwide', remote: '1' });
    expect(p('jobicy')[0]).toEqual({ tag: 'full stack' });
    expect(p('arbeitnow')).toEqual([{}]);
    expect(p('workingnomads')).toEqual([{}]);
    expect(p('justjoin')).toEqual([{}]);
    expect(p('jobico')).toEqual([{}]);
    expect(p('itlead')).toEqual([{}]);
  });

  it('targets Ukraine on LinkedIn and office Work.ua for office profiles', () => {
    const specs = buildSourceQueries({ ...base, remoteType: 'office', sources: ['workua', 'linkedin'] });
    expect(specs.find((s) => s.sourceId === 'workua')!.params).toEqual({ search: 'full stack' });
    expect(specs.find((s) => s.sourceId === 'linkedin')!.params).toEqual({ keywords: 'full stack', location: 'Ukraine' });
  });
});

describe('DOU categories', () => {
  it('adds category feeds from keywords and skills', () => {
    const specs = buildSourceQueries({ keywords: ['full stack'], skills: ['React', 'Node.js'], remoteType: 'remote', sources: ['dou' as SourceId] });
    expect(specs.filter((s) => s.params.category).map((s) => s.params.category)).toEqual(['Front End', 'Node.js', 'JavaScript']);
  });
  it('matches next as a word only, not inside context', () => {
    const cat = (kw: string) => buildSourceQueries({ keywords: [kw], skills: [], remoteType: 'remote', sources: ['dou'] }).map((s) => s.params.category).filter(Boolean);
    expect(cat('context engineer')).toEqual([]);
    expect(cat('next.js')).toEqual(['Front End']);
  });
  it('adds none for unrelated profiles', () => {
    const specs = buildSourceQueries({ keywords: ['accountant'], skills: ['Excel'], remoteType: 'office', sources: ['dou' as SourceId] });
    expect(specs.some((s) => s.params.category)).toBe(false);
  });
});

describe('searchTerms', () => {
  it('uses all keywords, their other spellings, then job-title variants, capped at 14', () => {
    expect(searchTerms({ keywords: ['full stack', 'react', 'node.js', 'next.js', 'frontend'], skills: ['TypeScript'] })).toEqual([
      'full stack', 'react', 'node.js', 'next.js', 'frontend',
      'fullstack', 'full-stack', 'фулстек', 'front-end', 'front end', 'фронтенд',
      'full stack developer', 'react developer', 'frontend developer',
    ]);
  });
  it('brings the other spellings of full stack and front end', () => {
    expect(searchTerms({ keywords: ['full stack engineer', 'frontend'], skills: [] })).toEqual([
      'full stack engineer', 'frontend', 'fullstack engineer', 'full-stack engineer', 'фулстек', 'front-end', 'front end', 'фронтенд', 'frontend developer',
    ]);
  });
  it('adds title variants for short profiles', () => {
    expect(searchTerms({ keywords: ['react'], skills: ['Node.js'] })).toEqual(['react', 'react developer', 'frontend developer', 'node.js developer']);
  });
  it('dedupes case-insensitively and drops blanks', () => {
    expect(searchTerms({ keywords: [' React ', 'react', ''], skills: [] })).toEqual(['react', 'react developer', 'frontend developer']);
  });
});

describe('browser source terms', () => {
  it('limits Work.ua and OLX to the first 2 terms while other keyword sources keep all', () => {
    const profile = { keywords: ['full stack', 'react', 'node.js', 'next.js'], skills: [], remoteType: 'remote' as const, sources: ['workua', 'olx', 'jobicy'] as SourceId[] };
    const specs = buildSourceQueries(profile);
    const terms = (id: string) => specs.filter((s) => s.sourceId === id).map((s) => s.params.search ?? s.params.tag);
    expect(terms('workua')).toEqual(['full stack', 'react']);
    expect(terms('olx')).toEqual(['full stack', 'react']);
    expect(terms('jobicy')).toHaveLength(searchTerms(profile).length);
    expect(terms('jobicy').length).toBeGreaterThan(2);
  });
});

describe('adzuna queries', () => {
  it('builds 2 terms x 4 countries with remote', () => {
    const specs = buildSourceQueries({ keywords: ['react', 'node.js'], skills: [], remoteType: 'remote', sources: ['adzuna'] });
    expect(specs.map((s) => s.params)).toEqual([
      { what: 'react remote', country: 'pl' }, { what: 'react remote', country: 'de' }, { what: 'react remote', country: 'gb' }, { what: 'react remote', country: 'nl' },
      { what: 'node.js remote', country: 'pl' }, { what: 'node.js remote', country: 'de' }, { what: 'node.js remote', country: 'gb' }, { what: 'node.js remote', country: 'nl' },
    ]);
  });
});

describe('djinni categories', () => {
  it('maps full stack / frontend profiles to valid Djinni categories, max 4', () => {
    const specs = buildSourceQueries({ keywords: ['full stack', 'frontend'], skills: ['React', 'Node.js', 'TypeScript', 'Vue'], remoteType: 'any', sources: ['djinni'] });
    expect(specs.map((s) => s.params.primary_keyword)).toEqual(['Fullstack', 'JavaScript', 'React.js', 'Node.js']);
  });
  it('never emits an unknown category', () => {
    const valid = new Set(['Fullstack', 'React.js', 'Node.js', 'JavaScript', 'Vue.js', 'Angular', 'Python', 'Java', 'PHP', 'Golang', 'Ruby', 'Markup', 'React Native', 'iOS', 'Android', 'Flutter', 'DevOps', 'QA', 'Project Manager', 'Product Manager', 'Design', 'Marketing', 'Sales', 'HR']);
    for (const v of Object.values(DJINNI_PRIMARY_KEYWORDS)) expect(valid.has(v), v).toBe(true);
  });
});

describe('djinni categories from multi-word keywords', () => {
  const djinni = (keywords: string[], skills: string[] = []) =>
    buildSourceQueries({ keywords, skills, remoteType: 'any', sources: ['djinni'] }).map((s) => s.params.primary_keyword);

  it('maps headlines by contained known term', () => {
    expect(djinni(['senior full stack developer'])).toEqual(['Fullstack']);
    expect(djinni(['frontend react engineer'])).toEqual(['JavaScript', 'React.js', 'Markup']);
  });

  it('keeps keywords first, dedupes and caps at 4', () => {
    expect(djinni(['senior react developer', 'react'], ['Vue', 'Angular', 'Node.js'])).toEqual(['React.js', 'Vue.js', 'Angular', 'Node.js']);
  });

  it('matches whole words only', () => {
    expect(djinni(['context engineer'])).toEqual([undefined]);
    expect(djinni(['nodejs-free helper'])).toEqual([undefined]);
    expect(djinni(['gopher'])).toEqual([undefined]);
  });
});

const BASE_FOR_DOU = { remoteType: 'any' as const };

describe('DOU queries for non-JavaScript roles', () => {
  it('a QA profile also queries the DOU QA category (not only JavaScript ones)', () => {
    const qa = buildSourceQueries({ ...BASE_FOR_DOU, keywords: ['qa engineer', 'manual qa'], skills: ['Postman', 'Jira'], sources: ['dou' as SourceId] });
    const params = qa.filter((q) => q.sourceId === 'dou').map((q) => q.params);
    expect(params).toContainEqual({ category: 'QA' });
    expect(params).not.toContainEqual({ category: 'Front End' });
  });
});

describe('mobile searches', () => {
  it('maps React Native and Flutter to their Djinni and DOU categories', () => {
    const specs = buildSourceQueries({ keywords: ['react native', 'flutter developer'], skills: ['Expo'], remoteType: 'any', sources: ['djinni', 'dou'] });
    const djinni = specs.filter((s) => s.sourceId === 'djinni').map((s) => s.params.primary_keyword);
    expect(djinni).toEqual(expect.arrayContaining(['React Native', 'Flutter']));
    expect(djinni).not.toContain('React.js');
    const dou = specs.filter((s) => s.sourceId === 'dou').map((s) => s.params.category).filter(Boolean);
    expect(dou).toEqual(expect.arrayContaining(['iOS/macOS', 'Android']));
  });
});
