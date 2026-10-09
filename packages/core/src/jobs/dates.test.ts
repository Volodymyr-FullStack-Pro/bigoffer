import { describe, expect, it } from 'vitest';
import { kyivLocalDate, parseUkDate } from './dates';

describe('parseUkDate', () => {
  it('parses Ukrainian and Russian month names', () => {
    expect(parseUkDate('вакансія від 2 жовтня 2026')?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(parseUkDate('15 октября 2026')?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(parseUkDate('1 січня 2027')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('returns null when no date', () => {
    expect(parseUkDate('сьогодні')).toBeNull();
  });
});

describe('kyivLocalDate', () => {
  it('reads a zoneless stamp as Kyiv time, summer (+03:00) and winter (+02:00)', () => {
    expect(kyivLocalDate('2026-07-10T18:00:00')?.toISOString()).toBe('2026-07-10T15:00:00.000Z');
    expect(kyivLocalDate('2026-01-10 18:00')?.toISOString()).toBe('2026-01-10T16:00:00.000Z');
  });
  it('keeps an explicit zone and rejects junk', () => {
    expect(kyivLocalDate('2026-07-10T18:00:00Z')?.toISOString()).toBe('2026-07-10T18:00:00.000Z');
    expect(kyivLocalDate('2026-07-10T18:00:00+01:00')?.toISOString()).toBe('2026-07-10T17:00:00.000Z');
    expect(kyivLocalDate('yesterday')).toBeNull();
  });
});
