import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedCardFromJob, seedCv, seedMatch } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('prepares for an interview: plan, a lesson with code, progress and the pitch from the CV', async ({ context, page }) => {
  const email = uniqueEmail('prep');
  await loginAs(context, email);
  await seedCv(email);
  const { title, jobId } = await seedMatch(email, { score: 90, description: 'React, Node.js and PostgreSQL.' });
  await seedCardFromJob(email, jobId, title, 'interview');
  // Only cards with an interview: one still in talks is not offered yet.
  const talking = await seedMatch(email, { score: 80 });
  await seedCardFromJob(email, talking.jobId, talking.title, 'talking');

  await page.goto('/en/prep');
  await expect(visible(page, 'prep-candidate').filter({ hasText: talking.title })).toHaveCount(0);
  await visible(page, 'prep-candidate').filter({ hasText: title }).getByTestId('prep-start').click();
  await expect(page).toHaveURL(/\/en\/prep\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(visible(page, 'prep-role')).toContainText('[fake]');
  await expect(visible(page, 'prep-topic')).toHaveCount(2);
  await expect(visible(page, 'prep-progress')).toHaveText('0 of 2 topics');

  const first = visible(page, 'prep-topic').first();
  await first.getByTestId('prep-topic-open').click();
  await expect(first.getByTestId('prep-lesson')).toContainText('[fake]');
  await expect(first.getByTestId('prep-code').first()).toContainText('useState(0)');
  // Middle and Senior are written on demand, on top of Junior.
  await first.locator('[data-testid="prep-level"][data-level="middle"]').click();
  await expect(first.locator('[data-testid="prep-lesson"][data-level="middle"]')).toContainText('[fake middle]');
  await expect(first.getByTestId('prep-code')).toContainText('Partial<Pick<User');
  await first.locator('[data-testid="prep-level"][data-level="senior"]').click();
  await expect(first.locator('[data-testid="prep-lesson"][data-level="senior"]')).toContainText('[fake senior]');
  await first.locator('[data-testid="prep-level"][data-level="junior"]').click();
  await expect(first.locator('[data-testid="prep-lesson"][data-level="junior"]')).toContainText('[fake]');
  await first.getByTestId('prep-topic-done').click();
  await expect(visible(page, 'prep-progress')).toHaveText('1 of 2 topics');

  await visible(page, 'prep-pitch-write').click();
  await expect(visible(page, 'prep-pitch-intro')).toContainText('[fake]');

  // Kept: the lesson and the pitch come back without a new request, the list shows the progress.
  await page.reload();
  await visible(page, 'prep-topic').first().getByTestId('prep-topic-open').click();
  await expect(visible(page, 'prep-lesson').first()).toBeVisible();
  // Kept levels show a tick and open without writing again.
  await expect(visible(page, 'prep-level').and(page.locator('[data-level="senior"]'))).toContainText('✓');
  await visible(page, 'prep-level').and(page.locator('[data-level="senior"]')).click();
  await expect(page.locator('[data-testid="prep-lesson"][data-level="senior"]')).toContainText('[fake senior]');
  await expect(visible(page, 'prep-pitch-intro')).toBeVisible();
  await page.goto('/en/prep');
  await expect(visible(page, 'prep-item').filter({ hasText: title })).toContainText('1 of 2 topics');
});

test('the board card of an interview opens its prep', async ({ context, page }) => {
  const email = uniqueEmail('prep-board');
  await loginAs(context, email);
  const { title, jobId } = await seedMatch(email, { score: 90 });
  await seedCardFromJob(email, jobId, title, 'interview');
  await page.goto('/en/board');
  await visible(page, 'board-card').filter({ hasText: title }).click();
  await visible(page, 'panel-prep').click();
  await expect(page).toHaveURL(/\/en\/prep\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(visible(page, 'prep-topic')).toHaveCount(2);
});
