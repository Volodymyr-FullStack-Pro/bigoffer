import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('accepts a local absolute path with query', () => {
    expect(safeRedirectPath('/uk/today?x=1')).toBe('/uk/today?x=1');
  });
  it.each([null, undefined, '', 'uk/today', '//evil.com', '/\\evil.com', 'https://evil.com', '/x?u=https://evil.com'])(
    'rejects %s',
    (value) => {
      expect(safeRedirectPath(value)).toBeNull();
    },
  );
});
