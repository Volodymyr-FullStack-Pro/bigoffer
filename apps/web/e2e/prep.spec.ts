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

  await page.goto('/en/prep');
  await visible(page, 'prep-candidate').filter({ hasText: title }).getByTestId('prep-start').click();
  await expect(page).toHaveURL(/\/en\/prep\/[0-9a-f-]{36}$/);
  await expect(visible(page, 'prep-role')).toContainText('[fake]');
  await expect(visible(page, 'prep-topic')).toHaveCount(2);
  await expect(visible(page, 'prep-progress')).toHaveText('0 of 2 topics');

  const first = visible(page, 'prep-topic').first();
  await first.getByTestId('prep-topic-open').click();
  await expect(first.getByTestId('prep-lesson')).toContainText('[fake]');
  await expect(first.getByTestId('prep-code')).toContainText('useState(0)');
  await first.getByTestId('prep-topic-done').click();
  await expect(visible(page, 'prep-progress')).toHaveText('1 of 2 topics');

  await visible(page, 'prep-pitch-write').click();
  await expect(visible(page, 'prep-pitch-intro')).toContainText('[fake]');

  // Kept: the lesson and the pitch come back without a new request, the list shows the progress.
  await page.reload();
  await visible(page, 'prep-topic').first().getByTestId('prep-topic-open').click();
  await expect(visible(page, 'prep-lesson')).toBeVisible();
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
  await expect(page).toHaveURL(/\/en\/prep\/[0-9a-f-]{36}$/);
  await expect(visible(page, 'prep-topic')).toHaveCount(2);
});
