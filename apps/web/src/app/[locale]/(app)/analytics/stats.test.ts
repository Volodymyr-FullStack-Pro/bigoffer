import { describe, expect, it } from 'vitest';
import { type AppRow, computeStats } from './stats';

const NOW = new Date('2026-10-12T12:00:00Z');
const row = (o: Partial<AppRow>): AppRow => ({ column: 'applied', appliedAt: null, firstResponseAt: null, outcome: 'open', sourceId: 'djinni', rejectionReasons: [], ...o });

describe('computeStats', () => {
  const rows = [
    row({ column: 'saved' }),
    row({ appliedAt: '2026-10-12T08:00:00Z' }),
    row({ appliedAt: '2026-10-11T08:00:00Z', firstResponseAt: '2026-10-11T10:00:00Z', sourceId: 'dou' }),
    row({ column: 'interview', appliedAt: '2026-10-05T08:00:00Z' }),
    row({ column: 'offer', appliedAt: '2026-09-20T08:00:00Z', outcome: 'offer', sourceId: 'linkedin' }),
    row({ column: 'rejected', appliedAt: '2026-10-01T08:00:00Z', outcome: 'rejected', rejectionReasons: ['english', 'stack_mismatch'] }),
  ];
  const s = computeStats(rows, NOW, 'Europe/Kyiv');
  it('counts applications, responses, interviews and offers', () => {
    expect(s.applied7).toBe(2);
    expect(s.applied30).toBe(5);
    expect(s.funnel).toEqual({ saved: 6, applied: 5, responded: 3, interview: 2, offer: 1 });
    expect(s.responseRate).toBe(60);
  });
  it('builds a daily series ending today', () => {
    expect(s.days).toHaveLength(14);
    expect(s.days.at(-1)).toEqual({ date: '2026-10-12', count: 1 });
    expect(s.days.at(-2)).toEqual({ date: '2026-10-11', count: 1 });
  });
  it('ranks sources and rejection reasons', () => {
    expect(s.sources[0]).toEqual({ id: 'djinni', applied: 3, responded: 1 });
    expect(s.reasons.map((r) => r.key).sort()).toEqual(['english', 'stack_mismatch']);
  });
  it('has no response rate before the first application', () => {
    expect(computeStats([row({ column: 'saved' })], NOW, 'Europe/Kyiv').responseRate).toBeNull();
  });
});

describe('cards moved without an applied date', () => {
  it('still count as applied in the funnel', () => {
    const s = computeStats([{ column: 'interview', appliedAt: null, firstResponseAt: null, outcome: 'open', sourceId: null, rejectionReasons: [] }], new Date('2026-10-12T12:00:00Z'), 'Europe/Kyiv');
    expect(s.funnel).toMatchObject({ applied: 1, responded: 1, interview: 1 });
    expect(s.applied7).toBe(0);
  });
});
