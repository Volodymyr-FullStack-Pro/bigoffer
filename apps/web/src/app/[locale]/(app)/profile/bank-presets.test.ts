import { BANK_KEYS } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { BANK_PLACEHOLDER_KEYS, BANK_PRESETS, OTHER, presetChoice, presetsFor } from './bank-presets';

describe('bank presets', () => {
  it('only uses real bank keys', () => {
    for (const key of [...Object.keys(BANK_PRESETS), ...BANK_PLACEHOLDER_KEYS]) expect(BANK_KEYS).toContain(key);
  });

  it('selects a matching preset, case-insensitively', () => {
    expect(presetChoice('english', 'C1 (Advanced)')).toBe('C1 (Advanced)');
    expect(presetChoice('start_date', ' in 2 weeks ')).toBe('In 2 weeks');
  });

  it('falls back to Other for custom text and to empty for no answer', () => {
    expect(presetChoice('work_format', 'Remote, EU time zones only')).toBe(OTHER);
    expect(presetChoice('english', '')).toBe('');
  });

  it('has no presets for free-text and custom keys', () => {
    expect(presetsFor('salary')).toBeNull();
    expect(presetsFor('notice_period_1234')).toBeNull();
    expect(presetChoice('salary', '$3000')).toBe('');
  });
});
