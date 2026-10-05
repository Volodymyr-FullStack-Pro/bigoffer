import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterMatches } from './feed-filter';
import type { FeedMatch } from './feed-types';

const m = (id: string, over: Partial<FeedMatch> = {}): FeedMatch => ({
  id,
  score: 80,
  title: id,
  company: 'Acme',
  location: null,
  remoteType: 'remote',
  seniority: null,
  salaryMinUsd: null,
  salaryMaxUsd: null,
  summary: null,
  why: null,
  description: '',
  skills: [],
  missingSkills: [],
  breakdown: null,
  profileId: 'p1',
  createdAt: '2026-10-05T10:00:00.000Z',
  postings: [{ sourceId: 'dou', url: 'https://jobs.dou.ua/v/1' }],
  ...over,
});

describe('filterMatches', () => {
  const items = [
    m('a'),
    m('b', { score: 40 }),
    m('c', { remoteType: 'office' }),
    m('d', { postings: [{ sourceId: 'djinni', url: 'https://djinni.co/j/1' }] }),
    m('e', { profileId: 'p2' }),
  ];
  it('keeps everything with default filters', () => {
    expect(filterMatches(items, DEFAULT_FILTERS)).toHaveLength(5);
  });
  it('filters by score, format, source and profile', () => {
    expect(filterMatches(items, { ...DEFAULT_FILTERS, minScore: 50 }).map((x) => x.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(filterMatches(items, { ...DEFAULT_FILTERS, remote: 'office' }).map((x) => x.id)).toEqual(['c']);
    expect(filterMatches(items, { ...DEFAULT_FILTERS, source: 'djinni' }).map((x) => x.id)).toEqual(['d']);
    expect(filterMatches(items, { ...DEFAULT_FILTERS, profileId: 'p2' }).map((x) => x.id)).toEqual(['e']);
  });
});
