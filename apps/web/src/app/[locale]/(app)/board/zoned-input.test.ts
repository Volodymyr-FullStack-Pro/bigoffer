import { describe, expect, it } from 'vitest';
import { fromZonedInput, toZonedInput } from './zoned-input';

describe('zoned datetime-local helpers', () => {
  it('formats an instant in the zone (winter, UTC+2)', () => {
    expect(toZonedInput('2026-01-15T10:00:00.000Z', 'Europe/Kyiv')).toBe('2026-01-15T12:00');
  });
  it('formats an instant in the zone (summer, UTC+3)', () => {
    expect(toZonedInput('2026-07-15T10:00:00.000Z', 'Europe/Kyiv')).toBe('2026-07-15T13:00');
  });
  it('round-trips', () => {
    for (const iso of ['2026-01-15T10:00:00.000Z', '2026-07-15T10:30:00.000Z', '2026-10-24T21:00:00.000Z']) {
      expect(fromZonedInput(toZonedInput(iso, 'Europe/Kyiv'), 'Europe/Kyiv')).toBe(iso);
    }
  });
  it('handles the day of the DST change (Kyiv falls back on 2026-10-25 at 04:00)', () => {
    expect(fromZonedInput('2026-10-25T12:00', 'Europe/Kyiv')).toBe('2026-10-25T10:00:00.000Z');
    expect(fromZonedInput('2026-10-24T12:00', 'Europe/Kyiv')).toBe('2026-10-24T09:00:00.000Z');
    expect(toZonedInput('2026-10-25T10:00:00.000Z', 'Europe/Kyiv')).toBe('2026-10-25T12:00');
  });
  it('works for a zone behind UTC', () => {
    expect(fromZonedInput('2026-03-08T12:00', 'America/New_York')).toBe('2026-03-08T16:00:00.000Z');
  });
  it('rejects garbage and empty values', () => {
    expect(fromZonedInput('', 'Europe/Kyiv')).toBeNull();
    expect(toZonedInput(null, 'Europe/Kyiv')).toBe('');
  });
});
