import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedMatch } from './helpers/seed';

/**
 * Accessibility smoke test with axe: every main screen, desktop and phone. Fails on critical issues (a control with
 * no name, an image with no text, a broken ARIA role); serious ones (contrast, etc.) are printed for the next pass.
 */
async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('load');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const critical = violations.filter((v) => v.impact === 'critical');
  for (const v of violations.filter((x) => x.impact === 'serious')) {
    console.log(`[a11y serious] ${path} ${v.id}: ${v.nodes.length} × ${v.help}`);
  }
  expect(
    critical.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    `critical a11y issues on ${path}`,
  ).toEqual([]);
}

test('login page has no critical accessibility issues', async ({ page }) => {
  await audit(page, '/en/login');
});

test('main screens have no critical accessibility issues', async ({ context, page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('a11y');
  await loginAs(context, email);
  await seedMatch(email, { title: 'Senior React Engineer' });
  for (const path of ['/en/today', '/en/board', '/en/search', '/en/prep', '/en/library', '/en/analytics', '/en/profile']) {
    await audit(page, path);
  }
});
