import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedBankAnswer, seedCv, seedMatch } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function openKit(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
  await visible(page, 'apply-kit-open').click();
}

test('generates the apply kit, answers form questions from the bank and AI, marks applied', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit');
  await loginAs(context, email);
  await seedCv(email);
  await seedBankAnswer(email, 'salary', '$4000–4500 per month');
  const { title } = await seedMatch(email, { score: 90 });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await visible(page, 'kit-generate').click();
  await expect(visible(page, 'kit-letter')).toHaveValue(/full stack developer/i);
  await expect(visible(page, 'kit-requirement').filter({ hasText: 'Kubernetes' })).toHaveAttribute('data-status', 'missing');
  await expect(visible(page, 'kit-red-flag')).toContainText('Unpaid trial');
  await expect(visible(page, 'kit-short')).toContainText('[fake]');
  await expect(visible(page, 'contact-chip').filter({ hasText: 'CV link' })).toBeVisible();

  await visible(page, 'kit-form-input').fill('1. What are your salary expectations?\n2. Do you have Kubernetes experience?');
  await visible(page, 'kit-form-submit').click();
  await expect(visible(page, 'kit-answer').first()).toHaveAttribute('data-from-bank', 'true');
  await expect(visible(page, 'kit-answer').first().getByRole('textbox')).toHaveValue('$4000–4500 per month');
  await expect(visible(page, 'kit-answer').nth(1).getByRole('textbox')).toHaveValue('Fake answer 1');

  const popup = context.waitForEvent('page');
  await visible(page, 'kit-apply').click();
  const tab = await popup;
  await tab.close();
  await page.bringToFront();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await visible(page, 'kit-applied-yes').click();
  await expect(page.getByText('Moved to Applied.').filter({ visible: true })).toBeVisible();
  await page.goto('/en/board');
  await expect(page.locator('[data-testid="board-column"][data-column-key="applied"]').getByText(title)).toBeVisible();
});

test('without a CV the kit explains what to do', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-nocv');
  await loginAs(context, email);
  await seedMatch(email, { score: 88 });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await expect(visible(page, 'kit-error')).toContainText('Upload your CV');
  await expect(visible(page, 'kit-generate')).toBeDisabled();
});
