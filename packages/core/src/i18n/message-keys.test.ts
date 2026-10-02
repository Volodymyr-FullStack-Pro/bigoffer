import { describe, expect, it } from 'vitest';
import { findMissingKeys, flattenKeys } from './message-keys';

describe('flattenKeys', () => {
  it('flattens nested objects into sorted dot paths', () => {
    expect(flattenKeys({ nav: { today: 'a', board: 'b' }, app: 'x' })).toEqual([
      'app',
      'nav.board',
      'nav.today',
    ]);
  });
  it('returns empty array for empty object', () => {
    expect(flattenKeys({})).toEqual([]);
  });
});

describe('findMissingKeys', () => {
  it('lists keys present in base but absent in other', () => {
    const base = { nav: { today: 'a', board: 'b' }, app: 'x' };
    const other = { nav: { today: 'a' }, app: 'y' };
    expect(findMissingKeys(base, other)).toEqual(['nav.board']);
  });
  it('returns empty array when other has all keys', () => {
    expect(findMissingKeys({ a: { b: '1' } }, { a: { b: '2' }, c: '3' })).toEqual([]);
  });
});
