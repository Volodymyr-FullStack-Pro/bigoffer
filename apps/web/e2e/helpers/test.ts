import { expect, type Page, test as base } from '@playwright/test';

export { expect, type Page };

/**
 * React streams a page into a hidden <div id="S:…"> and swaps it in a moment later (reveals are batched). Until then
 * every element of the page exists twice, which trips Playwright's strict mode; navigation waits for the swap.
 */
async function settled(page: Page) {
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, { timeout: 10_000 }).catch(() => {});
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = (async (...args: Parameters<Page['goto']>) => {
      const res = await goto(...args);
      await settled(page);
      return res;
    }) as Page['goto'];
    page.reload = (async (...args: Parameters<Page['reload']>) => {
      const res = await reload(...args);
      await settled(page);
      return res;
    }) as Page['reload'];
    await provide(page);
  },
});
