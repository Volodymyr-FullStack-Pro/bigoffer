import { describe, expect, it } from 'vitest';
import { buildSourceQueries, parseList, searchProfileInputSchema } from './search';

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
      isActive: true,
    });
    expect(r.success).toBe(true);
  });
  it('requires at least one keyword', () => {
    const r = searchProfileInputSchema.safeParse({
      name: 'x', keywords: [], skills: [], excludeKeywords: [], seniority: [], locations: [],
      remoteType: 'any', salaryMinUsd: null, isActive: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('buildSourceQueries', () => {
  const specs = buildSourceQueries({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'] });
  const bySource = (id: string) => specs.filter((s) => s.sourceId === id);

  it('creates one query per keyword for search sources', () => {
    expect(bySource('dou').map((s) => s.params)).toEqual([{ search: 'full stack' }, { search: 'react developer' }]);
    expect(bySource('robotaua')).toHaveLength(2);
    expect(bySource('himalayas')[0]!.params).toEqual({ q: 'full stack' });
  });
  it('maps skills to djinni primary keywords', () => {
    expect(bySource('djinni').map((s) => s.params)).toEqual([
      { primary_keyword: 'React.js' },
      { primary_keyword: 'Node.js' },
    ]);
  });
  it('uses a slug tag for remoteok and no params for feeds', () => {
    expect(bySource('remoteok')[0]!.params).toEqual({ tag: 'react' });
    expect(bySource('wwr')[0]!.params).toEqual({});
    expect(bySource('hn')[0]!.params).toEqual({});
  });
  it('builds deterministic unique query keys', () => {
    expect(bySource('dou')[0]!.queryKey).toBe('dou:{"search":"full stack"}');
    expect(new Set(specs.map((s) => s.queryKey)).size).toBe(specs.length);
  });
});
