import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { countApplications, matchState, seedMatch } from './helpers/seed';

const visible = (page: import('@playwright/test').Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('saves a match to the board and can undo it', async ({ context, page }) => {
  const email = uniqueEmail('feed-save');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 91 });
  await page.goto('/en/today');
  await expect(visible(page, 'feed-progress')).toHaveText('0 / 1');
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

for (const [sourceId, paid] of [['remoteok', true], ['dou', false]] as const) {
  test(`${paid ? 'flags' : 'does not flag'} a ${sourceId} posting as paid apply`, async ({ context, page, isMobile }) => {
    const email = uniqueEmail(`feed-paid-${sourceId}`);
    await loginAs(context, email);
    await seedMatch(email, { score: 90, sourceId, url: `https://example.com/${sourceId}/e2e` });
    await page.goto('/en/today');
    if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
    await expect(visible(page, 'match-open')).toHaveCount(1);
    await expect(visible(page, 'paid-apply')).toHaveCount(paid ? 1 : 0);
    if (paid) await expect(visible(page, 'paid-apply')).toHaveText('paid apply');
  });
}
