import { describe, expect, it } from 'vitest';
import { type RenderablePage, renderOnPage } from '../src/browser';
import { SourceBlockedError } from '../src/types';

function fakePage(o: { status: number; title?: string; selectorAppears: boolean }): RenderablePage {
  return {
    goto: async () => ({ status: () => o.status }),
    waitForSelector: async () => {
      if (!o.selectorAppears) throw new Error('timeout');
    },
    title: async () => o.title ?? 'Робота',
    content: async () => '<html>ok</html>',
  };
}

describe('renderOnPage', () => {
  it('returns content when a 403 challenge resolves and the selector appears', async () => {
    await expect(renderOnPage(fakePage({ status: 403, selectorAppears: true }), 'u', { waitForSelector: '.c' })).resolves.toBe('<html>ok</html>');
  });
  it('throws SourceBlockedError when 403 and the selector never appears', async () => {
    await expect(renderOnPage(fakePage({ status: 403, selectorAppears: false }), 'u', { waitForSelector: '.c' })).rejects.toBeInstanceOf(SourceBlockedError);
  });
  it('treats a 200 challenge interstitial as blocked instead of empty', async () => {
    await expect(
      renderOnPage(fakePage({ status: 200, title: 'Just a moment...', selectorAppears: false }), 'u', { waitForSelector: '.c' }),
    ).rejects.toBeInstanceOf(SourceBlockedError);
  });
  it('returns a genuine empty results page', async () => {
    await expect(renderOnPage(fakePage({ status: 200, selectorAppears: false }), 'u', { waitForSelector: '.c' })).resolves.toBe('<html>ok</html>');
  });
});
