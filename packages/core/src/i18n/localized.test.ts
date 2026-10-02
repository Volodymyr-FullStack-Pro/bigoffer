import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale, LOCALES } from './locales';
import { localized } from './localized';

describe('DEFAULT_LOCALE', () => {
  it('is English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('isLocale', () => {
  it('accepts supported locales', () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('localized', () => {
  it('returns the requested locale', () => {
    expect(localized({ uk: 'Збережено', ru: 'Сохранено', en: 'Saved' }, 'ru')).toBe('Сохранено');
  });
  it('falls back to en when requested locale is missing', () => {
    expect(localized({ en: 'Saved' }, 'uk')).toBe('Saved');
  });
  it('treats empty strings as missing', () => {
    expect(localized({ uk: '', en: 'Saved' }, 'uk')).toBe('Saved');
  });
  it('falls back to the first non-empty value', () => {
    expect(localized({ ru: 'Сохранено' }, 'uk')).toBe('Сохранено');
  });
  it('returns empty string for null, undefined or empty object', () => {
    expect(localized(null, 'uk')).toBe('');
    expect(localized(undefined, 'uk')).toBe('');
    expect(localized({}, 'uk')).toBe('');
  });
});
