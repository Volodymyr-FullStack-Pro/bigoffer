import { type PageRenderer, SourceBlockedError } from './types';

export async function createPlaywrightRenderer(opts: { userAgent: string; locale?: string }): Promise<PageRenderer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: opts.userAgent, locale: opts.locale ?? 'uk-UA' });
  return {
    async render(url, { waitForSelector, timeoutMs = 30_000 } = {}) {
      const page = await context.newPage();
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        const status = res?.status() ?? 0;
        if (status === 403 || status === 429) throw new SourceBlockedError(status, url);
        if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: timeoutMs }).catch(() => undefined);
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}
