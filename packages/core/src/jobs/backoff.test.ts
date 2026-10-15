import { describe, expect, it } from 'vitest';
import { errorText, queryBackoff } from './backoff';

describe('queryBackoff', () => {
  it('waits longer after runs that found nothing new, up to the board cap', () => {
    expect(queryBackoff([0, 0], 4)).toBe(1);
    expect(queryBackoff([0, 0, 0], 4)).toBe(2);
    expect(queryBackoff([0, 0, 0, 0, 0, 0], 4)).toBe(4);
    expect(queryBackoff([0, 0, 0, 0, 0, 0], 2)).toBe(2);
    expect(queryBackoff([0, 0, 0, 0, 0, 0], 1)).toBe(1);
  });
  it('one new job resets it', () => {
    expect(queryBackoff([1, 0, 0, 0, 0, 0], 4)).toBe(1);
    expect(queryBackoff([0, 0, 3, 0, 0, 0], 4)).toBe(1);
    expect(queryBackoff([], 4)).toBe(1);
  });
});

describe('errorText', () => {
  it('reads Supabase error objects instead of "[object Object]"', () => {
    expect(errorText({ code: '57014', message: 'canceling statement due to statement timeout', details: null })).toBe(
      '57014: canceling statement due to statement timeout',
    );
    expect(errorText(new Error('boom'))).toBe('boom');
    expect(errorText({ status: 502 })).toBe('{"status":502}');
    expect(errorText('plain')).toBe('plain');
  });
});
