import { expect, test } from './helpers/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedMatch, seedSearchProfile } from './helpers/seed';

const visible = (page: import('@playwright/test').Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('feed filters are remembered across reloads', async ({ context, page }) => {
  const email = uniqueEmail('prefs-feed');
  await loginAs(context, email);
  await seedMatch(email, { score: 88, postedAt: new Date().toISOString() });
  await page.goto('/en/today');
  await visible(page, 'filter-fresh').check();
  await visible(page, 'sort-select').selectOption('newest');
  await page.waitForTimeout(1200); // debounced save
  await page.reload();
  await expect(visible(page, 'filter-fresh')).toBeChecked();
  await expect(visible(page, 'sort-select')).toHaveValue('newest');
});

test('search now: autopilot toggle sticks and a repeat run is rate-limited', async ({ context, page }) => {
  const email = uniqueEmail('prefs-search');
  await loginAs(context, email);
  await seedSearchProfile(email);
  await page.goto('/en/today');
  const block = page.getByTestId('search-now').filter({ visible: true });
  await expect(block).toBeVisible();
  await expect(block.getByTestId('autopilot')).toBeChecked();
  await block.getByTestId('autopilot').uncheck();
  await expect.poll(async () => {
    await page.reload();
    return block.getByTestId('autopilot').isChecked();
  }).toBe(false);

  await block.getByTestId('search-now-start').click();
  // The first request is accepted (the worker may be absent locally); a second one within 30 min is refused.
  await page.reload();
  await expect(block.getByTestId('search-now-start')).toBeEnabled();
  await block.getByTestId('search-now-start').click();
  await expect(block).toContainText('less than 30 minutes ago');
});
