import { describe, expect, it } from 'vitest';
import { chooseTemplate, kitCandidate } from './template';

const T = [{ locale: 'uk', body: 'UK' }, { locale: 'en', body: 'EN' }];

describe('chooseTemplate', () => {
  it('explicit lang uses only that locale', () => {
    expect(chooseTemplate(T, 'uk', 'en')).toBe('UK');
    expect(chooseTemplate(T, 'ru', 'en')).toBeNull();
  });
  it('auto prefers the profile locale, then en, then none', () => {
    expect(chooseTemplate(T, 'auto', 'uk')).toBe('UK');
    expect(chooseTemplate(T, 'auto', 'ru')).toBe('EN');
    expect(chooseTemplate([{ locale: 'uk', body: 'UK' }], 'auto', 'ru')).toBeNull();
    expect(chooseTemplate(null, 'auto', null)).toBeNull();
  });
});

describe('kitCandidate', () => {
  it('keeps the name and non-empty string contacts only', () => {
    expect(kitCandidate({ full_name: ' Jane Doe ', contacts: { phone: '+380 50 000 0000', github: '', linkedin: 42, unknown: 'x' } })).toEqual({
      fullName: 'Jane Doe',
      contacts: { phone: '+380 50 000 0000' },
    });
  });
  it('handles a missing profile', () => {
    expect(kitCandidate(null)).toEqual({ fullName: null, contacts: {} });
    expect(kitCandidate({ full_name: '', contacts: null })).toEqual({ fullName: null, contacts: {} });
  });
});
