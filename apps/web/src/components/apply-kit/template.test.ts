import { describe, expect, it } from 'vitest';
import { chooseTemplate } from './template';

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
