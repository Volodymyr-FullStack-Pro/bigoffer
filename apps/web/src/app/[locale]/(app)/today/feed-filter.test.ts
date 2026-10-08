import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterMatches, mergeMatches, sortMatches } from './feed-filter';
import type { FeedMatch } from './feed-types';

const m = (id: string, over: Partial<FeedMatch> = {}): FeedMatch => ({
  id,
  jobId: `j-${id}`,
  score: 80,
  title: id,
  company: 'Acme',
  companyIsPlaceholder: false,
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
  postedAt: null,
  firstSeenAt: '2026-10-05T10:00:00.000Z',
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

describe('fresh filter and sorting', () => {
  const now = new Date('2026-10-07T12:00:00.000Z');
  const items = [
    m('old', { postedAt: '2026-10-04T12:00:00.000Z', firstSeenAt: '2026-10-07T11:00:00.000Z' }),
    m('new', { postedAt: '2026-10-07T10:00:00.000Z', firstSeenAt: '2026-10-07T11:00:00.000Z' }),
    m('unposted', { postedAt: null, firstSeenAt: '2026-10-07T06:00:00.000Z' }),
    m('stale-seen', { postedAt: null, firstSeenAt: '2026-10-05T06:00:00.000Z' }),
  ];
  it('fresh keeps jobs posted (or first seen) within 24h', () => {
    expect(filterMatches(items, { ...DEFAULT_FILTERS, fresh: true }, now).map((x) => x.id)).toEqual(['new', 'unposted']);
    expect(filterMatches(items, DEFAULT_FILTERS, now)).toHaveLength(4);
  });
  it('newest sorts by postedAt ?? firstSeenAt descending; best keeps the order', () => {
    expect(sortMatches(items, 'newest').map((x) => x.id)).toEqual(['new', 'unposted', 'stale-seen', 'old']);
    expect(sortMatches(items, 'best').map((x) => x.id)).toEqual(['old', 'new', 'unposted', 'stale-seen']);
  });
});

describe('future posted_at', () => {
  const now = new Date('2026-10-07T12:00:00.000Z');
  const future = m('future', { postedAt: '2026-10-20T00:00:00.000Z' });
  const recent = m('recent', { postedAt: '2026-10-07T11:59:00.000Z' });
  it('counts as now for the filter and does not outrank a genuinely newer job in sort', () => {
    const stale = m('stale', { postedAt: '2026-10-01T00:00:00.000Z' });
    expect(filterMatches([future, stale], { ...DEFAULT_FILTERS, fresh: true }, now).map((x) => x.id)).toEqual(['future']);
    expect(sortMatches([recent, future], 'newest', now).map((x) => x.id)).toEqual(['future', 'recent']);
    expect(sortMatches([m('x', { postedAt: '2026-10-30T00:00:00.000Z' }), future], 'newest', now).map((x) => x.id)).toEqual(['x', 'future']);
  });
});

describe('mergeMatches', () => {
  it('appends only fresh matches not already present', () => {
    expect(mergeMatches([m('a'), m('b')], [m('b'), m('c')]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('orders the union by score desc, then created_at desc', () => {
    const base = [m('hi', { score: 90 }), m('mid-old', { score: 70, createdAt: '2026-10-05T08:00:00.000Z' })];
    const fresh = [m('low', { score: 40 }), m('mid-new', { score: 70, createdAt: '2026-10-06T08:00:00.000Z' }), m('top', { score: 95 })];
    expect(mergeMatches(base, fresh).map((x) => x.id)).toEqual(['top', 'hi', 'mid-new', 'mid-old', 'low']);
  });
});
