import { findMissingKeys, LOCALES } from '@jp/core';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const all = { uk, ru, en } as const;

describe('translation files', () => {
  it.each(LOCALES)('%s has every key that uk has', (locale) => {
    expect(findMissingKeys(uk, all[locale])).toEqual([]);
  });
  it.each(LOCALES)('uk has every key that %s has', (locale) => {
    expect(findMissingKeys(all[locale], uk)).toEqual([]);
  });
});
