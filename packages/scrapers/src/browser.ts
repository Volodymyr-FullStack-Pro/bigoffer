import { type PageRenderer, SourceBlockedError } from './types';

export type RenderablePage = {
  goto(url: string, opts: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{ status(): number } | null>;
  waitForSelector(selector: string, opts: { timeout: number }): Promise<unknown>;
  title(): Promise<string>;
  content(): Promise<string>;
};

const CHALLENGE_TITLE = /just a moment|attention required|access denied|checking your browser|captcha|forbidden/i;

/**
 * Navigates and returns the HTML. A 403/429/503 on the first navigation (or a 200 challenge interstitial) is
 * often an anti-bot challenge that resolves itself once its JS completes, so we wait for the target selector
 * first and only report a block when it never appears and the page is still a challenge/forbidden page.
 */
export async function renderOnPage(
  page: RenderablePage,
  url: string,
  { waitForSelector, timeoutMs = 30_000 }: { waitForSelector?: string; timeoutMs?: number } = {},
): Promise<string> {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const status = res?.status() ?? 0;
  const blockedStatus = status === 403 || status === 429 || status === 503;
  let found = false;
  if (waitForSelector) {
    found = await page.waitForSelector(waitForSelector, { timeout: timeoutMs }).then(
      () => true,
      () => false,
    );
  }
  if (found) return page.content();
  const looksBlocked = CHALLENGE_TITLE.test(await page.title().catch(() => ''));
  if (blockedStatus || looksBlocked) throw new SourceBlockedError(blockedStatus ? status : 403, url);
  return page.content();
}

export async function createPlaywrightRenderer(opts: { userAgent: string; locale?: string }): Promise<PageRenderer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ userAgent: opts.userAgent, locale: opts.locale ?? 'uk-UA' });
  } catch (err) {
    await browser.close();
    throw err;
  }
  return {
    async render(url, opts) {
      const page = await context.newPage();
      try {
        return await renderOnPage(page, url, opts);
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}
