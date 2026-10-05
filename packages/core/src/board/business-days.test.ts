import { describe, expect, it } from 'vitest';
import { businessDaysBetween } from './business-days';

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe('businessDaysBetween', () => {
  it('counts weekdays after the start up to the end', () => {
    expect(businessDaysBetween(d('2026-09-28'), d('2026-10-05'))).toBe(5); // Mon → next Mon
    expect(businessDaysBetween(d('2026-10-02'), d('2026-10-05'))).toBe(1); // Fri → Mon
    expect(businessDaysBetween(d('2026-10-05'), d('2026-10-05'))).toBe(0);
    expect(businessDaysBetween(d('2026-10-05'), d('2026-10-02'))).toBe(0);
  });
});
