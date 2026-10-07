import { describe, expect, it } from 'vitest';
import { parseUkDate } from './dates';

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
