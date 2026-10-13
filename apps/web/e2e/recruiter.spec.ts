import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedApplication, seedCv } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('writes a LinkedIn note, logs it as sent and switches to follow-up', async ({ context, page }) => {
  const email = uniqueEmail('recruiter');
  await loginAs(context, email);
  await seedCv(email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 8 });
  await page.goto('/en/board');
  await visible(page, 'board-card').filter({ hasText: title }).click();
  await visible(page, 'msg-generate').click();
  await expect(visible(page, 'msg-body')).toHaveValue(/\[fake\]/);
  await expect(visible(page, 'msg-count')).toContainText('/ 300');
  await visible(page, 'msg-sent').click();
  await expect(visible(page, 'msg-item')).toHaveAttribute('data-direction', 'out');
  await expect(visible(page, 'msg-kind')).toHaveValue('follow_up');
  await expect(visible(page, 'panel-history')).toContainText('Message sent');
  await page.reload();
  await expect(visible(page, 'board-card').filter({ hasText: title }).getByTestId('card-urgency')).toHaveCount(0);
});

test('explains that a CV is needed', async ({ context, page }) => {
  const email = uniqueEmail('recruiter-nocv');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await visible(page, 'board-card').filter({ hasText: title }).click();
  await visible(page, 'msg-generate').click();
  await expect(visible(page, 'msg-error')).toContainText('Upload your CV');
});
