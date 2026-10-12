import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { countApplications, matchState, seedMatch } from './helpers/seed';

const visible = (page: import('@playwright/test').Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('saves a match to the board and can undo it', async ({ context, page }) => {
  const email = uniqueEmail('feed-save');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 91 });
  await page.goto('/en/today');
  await expect(visible(page, 'feed-progress')).toContainText('0/1');
  await visible(page, 'match-save').click();
  await expect(visible(page, 'toast')).toContainText(title);
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await visible(page, 'toast-undo').click();
  await expect(visible(page, 'job-match').filter({ hasText: title })).toBeVisible();
  await visible(page, 'match-save').click();
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await expect.poll(() => countApplications(email)).toBe(1);
  await page.goto('/en/board');
  await expect(page.getByTestId('board-card').filter({ visible: true }).filter({ hasText: title })).toBeVisible();
});

test('hides a match and keeps it hidden after reload', async ({ context, page }) => {
  const email = uniqueEmail('feed-hide');
  await loginAs(context, email);
  const { matchId, title } = await seedMatch(email, { score: 77 });
  await page.goto('/en/today');
  await visible(page, 'match-hide').click();
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await expect.poll(() => matchState(matchId)).toBe('hidden');
  await page.reload();
  await expect(page.getByText(title)).toHaveCount(0);
});

test('keyboard: J/K move the selection, A marks applied', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'hotkeys are a desktop feature');
  const email = uniqueEmail('feed-keys');
  await loginAs(context, email);
  const low = await seedMatch(email, { score: 60 });
  const high = await seedMatch(email, { score: 95 });
  await page.goto('/en/today');
  await expect(visible(page, 'match-detail')).toContainText(high.title);
  await page.keyboard.press('j');
  await expect(visible(page, 'match-detail')).toContainText(low.title);
  await page.keyboard.press('k');
  await page.keyboard.press('a');
  await expect(visible(page, 'toast')).toContainText(high.title);
  await expect(visible(page, 'match-detail')).toContainText(low.title);
});

test('filters by minimum score', async ({ context, page }) => {
  const email = uniqueEmail('feed-filter');
  await loginAs(context, email);
  const low = await seedMatch(email, { score: 45 });
  const high = await seedMatch(email, { score: 92 });
  await page.goto('/en/today');
  await visible(page, 'filter-min-score').selectOption('70');
  await expect(page.getByText(high.title).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(low.title).filter({ visible: true })).toHaveCount(0);
});

test('undoing a hide brings the match back, also after reload', async ({ context, page }) => {
  const email = uniqueEmail('feed-undo-hide');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 83 });
  await page.goto('/en/today');
  await visible(page, 'match-hide').click();
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await visible(page, 'toast-undo').click();
  await expect(visible(page, 'job-match').filter({ hasText: title })).toBeVisible();
  await page.reload();
  await expect(visible(page, 'job-match').filter({ hasText: title })).toBeVisible();
});

test('fresh filter keeps only jobs from the last 24h and newest sort puts them first', async ({ context, page }) => {
  const email = uniqueEmail('feed-fresh');
  await loginAs(context, email);
  const hour = 3600 * 1000;
  const old = await seedMatch(email, { score: 95, postedAt: new Date(Date.now() - 72 * hour).toISOString() });
  const fresh = await seedMatch(email, { score: 60, postedAt: new Date(Date.now() - 2 * hour).toISOString() });
  await page.goto('/en/today');
  const titles = page.getByText(/Senior Full Stack Developer/).filter({ visible: true });
  await expect(titles.first()).toContainText(old.title);
  await visible(page, 'sort-select').selectOption('newest');
  await expect(titles.first()).toContainText(fresh.title);
  await visible(page, 'sort-select').selectOption('best');
  await visible(page, 'filter-fresh').check();
  await expect(page.getByText(fresh.title).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(old.title).filter({ visible: true })).toHaveCount(0);
});

test('details: required experience badge and copy description', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'the details panel is the desktop layout');
  const email = uniqueEmail('feed-details');
  await loginAs(context, email);
  await seedMatch(email, {
    score: 80,
    description: 'We build payments. Requirements: 3+ years of commercial experience with React and TypeScript.',
    matchedSkills: ['React'],
  });
  await page.goto('/en/today');
  const detail = page.getByTestId('match-detail').filter({ visible: true });
  await expect(detail.getByTestId('required-years')).toHaveText('Experience: 3+ yrs');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await detail.getByTestId('copy-description').click();
  await expect(detail.getByTestId('copy-description')).toContainText('Copied');
});
