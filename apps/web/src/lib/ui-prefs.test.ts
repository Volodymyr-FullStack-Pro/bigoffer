import { describe, expect, it } from 'vitest';
import { mergeUiPrefs, parseUiPrefs } from './ui-prefs';

describe('ui prefs', () => {
  it('keeps valid sections and drops broken ones', () => {
    expect(parseUiPrefs({ feed: { fresh: true, sort: 'newest' }, kitLang: 'xx', junk: 1 })).toEqual({ feed: { fresh: true, sort: 'newest' } });
    expect(parseUiPrefs(null)).toEqual({});
    expect(parseUiPrefs('nope')).toEqual({});
  });
  it('merges feed fields and board columns instead of replacing them', () => {
    const cur = parseUiPrefs({ feed: { fresh: true, sort: 'newest' }, boardSort: { a: 'manual' }, kitLang: 'uk' });
    expect(mergeUiPrefs(cur, { feed: { minScore: 70 }, boardSort: { b: 'smart' } })).toEqual({
      feed: { fresh: true, sort: 'newest', minScore: 70 },
      boardSort: { a: 'manual', b: 'smart' },
      kitLang: 'uk',
    });
  });
});
