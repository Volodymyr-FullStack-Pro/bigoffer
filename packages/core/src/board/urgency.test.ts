import { describe, expect, it } from 'vitest';
import { applicationUrgency, columnCounters, smartSort, todayActions, type UrgencyInput } from './urgency';

const now = new Date('2026-10-05T12:00:00Z'); // Monday
const at = (s: string) => new Date(s);
const base: UrgencyInput = {
  columnKind: 'active',
  outcome: 'open',
  appliedAt: null,
  firstResponseAt: null,
  lastActivityAt: null,
  nextActionAt: null,
};

describe('applicationUrgency', () => {
  it('is none outside active open cards and without an application date', () => {
    expect(applicationUrgency(base, now)).toBe('none');
    expect(applicationUrgency({ ...base, columnKind: 'lost', appliedAt: at('2026-09-01T10:00:00Z') }, now)).toBe('none');
    expect(applicationUrgency({ ...base, outcome: 'offer', appliedAt: at('2026-09-01T10:00:00Z') }, now)).toBe('none');
  });

  it('flags an interview within 48 hours first', () => {
    expect(
      applicationUrgency({ ...base, appliedAt: at('2026-09-01T10:00:00Z'), nextActionAt: at('2026-10-06T09:00:00Z') }, now),
    ).toBe('interview_soon');
    expect(applicationUrgency({ ...base, nextActionAt: at('2026-10-09T09:00:00Z') }, now)).toBe('none');
  });

  it('counts business days since applying', () => {
    expect(applicationUrgency({ ...base, appliedAt: at('2026-10-01T12:00:00Z') }, now)).toBe('fresh');
    expect(applicationUrgency({ ...base, appliedAt: at('2026-09-28T12:00:00Z') }, now)).toBe('ping');
    expect(applicationUrgency({ ...base, appliedAt: at('2026-09-21T12:00:00Z') }, now)).toBe('overdue');
    expect(applicationUrgency({ ...base, appliedAt: at('2026-09-14T12:00:00Z') }, now)).toBe('ghosting');
  });

  it('resets after a reply or a ping', () => {
    expect(
      applicationUrgency({ ...base, appliedAt: at('2026-09-21T12:00:00Z'), firstResponseAt: at('2026-09-22T12:00:00Z') }, now),
    ).toBe('fresh');
    expect(
      applicationUrgency({ ...base, appliedAt: at('2026-09-21T12:00:00Z'), lastActivityAt: at('2026-10-02T12:00:00Z') }, now),
    ).toBe('fresh');
  });

  it('honours custom follow-up rules', () => {
    const rules = { followUpDays: [2, 4], ghostAfterDays: 30 };
    expect(applicationUrgency({ ...base, appliedAt: at('2026-10-01T12:00:00Z') }, now, rules)).toBe('ping');
  });
});

describe('board helpers', () => {
  const cards = [
    { id: 'a', rank: 'a0', urgency: 'fresh' as const, nextActionAt: null },
    { id: 'b', rank: 'a1', urgency: 'ping' as const, nextActionAt: null },
    { id: 'c', rank: 'a2', urgency: 'interview_soon' as const, nextActionAt: at('2026-10-06T09:00:00Z') },
    { id: 'd', rank: 'Zz', urgency: 'ghosting' as const, nextActionAt: null },
    { id: 'e', rank: 'a3', urgency: 'ping' as const, nextActionAt: null },
  ];

  it('sorts urgent cards first, then by rank', () => {
    expect(smartSort(cards).map((c) => c.id)).toEqual(['c', 'd', 'b', 'e', 'a']);
  });

  it('counts cards that need action', () => {
    expect(columnCounters(cards)).toEqual({ total: 5, needsAction: 4 });
  });

  it('lists today actions: interviews, then pings, then ghosting', () => {
    expect(todayActions(cards).map((a) => [a.id, a.kind])).toEqual([
      ['c', 'interview'],
      ['b', 'ping'],
      ['e', 'ping'],
      ['d', 'ghosting'],
    ]);
  });
});
