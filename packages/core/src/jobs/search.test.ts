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
  const specs = buildSourceQueries({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'], remoteType: 'any', sources: null });
  const bySource = (id: string) => specs.filter((s) => s.sourceId === id);
  const withLowYield = buildSourceQueries({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'], remoteType: 'any', sources: ['wwr', 'hn'] });

  it('creates one query per keyword for search sources', () => {
    expect(bySource('dou').map((s) => s.params).filter((p) => p.search)).toEqual(
      searchTerms({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'] }).map((search) => ({ search })),
    );
    expect(bySource('dou').filter((s) => s.params.search)).toHaveLength(5);
    expect(bySource('robotaua')).toHaveLength(5);
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
    expect(bySource('remoteok')[0]!.params).toEqual({ tag: 'react' });
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
    expect(ids.has('linkedin')).toBe(false);
    expect(ids.has('justjoin')).toBe(false);
    expect(ids.has('djinni')).toBe(true);
  });

  it('builds params for new sources', () => {
    const specs = buildSourceQueries({
      ...base,
      sources: ['workua', 'olx', 'linkedin', 'jobicy', 'arbeitnow', 'workingnomads', 'justjoin', 'jobico'],
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
  });

  it('targets Ukraine on LinkedIn and office Work.ua for office profiles', () => {
    const specs = buildSourceQueries({ ...base, remoteType: 'office', sources: ['workua', 'linkedin'] });
    expect(specs.find((s) => s.sourceId === 'workua')!.params).toEqual({ search: 'full stack' });
    expect(specs.find((s) => s.sourceId === 'linkedin')!.params).toEqual({ keywords: 'full stack', location: 'Ukraine' });
  });
});

describe('DOU categories', () => {
  it('adds category feeds from keywords and skills', () => {
    const specs = buildSourceQueries({ keywords: ['full stack'], skills: ['React', 'Node.js'], remoteType: 'remote', sources: ['dou'] });
    expect(specs.filter((s) => s.params.category).map((s) => s.params.category)).toEqual(['Front End', 'Node.js', 'JavaScript']);
  });
  it('matches next as a word only, not inside context', () => {
    const cat = (kw: string) => buildSourceQueries({ keywords: [kw], skills: [], remoteType: 'remote', sources: ['dou'] }).map((s) => s.params.category).filter(Boolean);
    expect(cat('context engineer')).toEqual([]);
    expect(cat('next.js')).toEqual(['Front End']);
  });
  it('adds none for unrelated profiles', () => {
    const specs = buildSourceQueries({ keywords: ['accountant'], skills: ['Excel'], remoteType: 'office', sources: ['dou'] });
    expect(specs.some((s) => s.params.category)).toBe(false);
  });
});

describe('searchTerms', () => {
  it('uses all keywords plus job-title variants, capped at 6', () => {
    expect(searchTerms({ keywords: ['full stack', 'react', 'node.js', 'next.js', 'frontend'], skills: ['TypeScript'] })).toEqual([
      'full stack', 'react', 'node.js', 'next.js', 'frontend', 'full stack developer',
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
    const valid = new Set(['Fullstack', 'React.js', 'Node.js', 'JavaScript', 'Vue.js', 'Angular', 'Python', 'Java', 'PHP', 'C# / .NET', 'Golang', 'Ruby', 'iOS', 'Android', 'Flutter', 'DevOps', 'QA', 'Project Manager', 'Product Manager', 'Design', 'Marketing', 'Sales', 'HR']);
    for (const v of Object.values(DJINNI_PRIMARY_KEYWORDS)) expect(valid.has(v), v).toBe(true);
  });
});
