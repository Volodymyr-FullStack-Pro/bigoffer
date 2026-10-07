import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('onboarding: answer bank, letter template, finish', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('onboarding'));
  await page.goto('/en/today');
  await page.getByTestId('onboarding-banner').click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  const salary = page.locator('[data-testid="bank-answer"][data-key="salary"]');
  await salary.getByRole('textbox').fill('$4000–4500 per month');
  await salary.getByTestId('bank-save').click();
  await expect(page.getByTestId('answer-bank').getByRole('status')).toHaveText('Saved.');
  await page.getByTestId('bank-add-question').fill('Notice period');
  await page.getByTestId('bank-add-answer').fill('Two weeks');
  await page.getByTestId('bank-add').click();
  const custom = page.locator('[data-testid="bank-answer"][data-key^="notice_period_"]');
  await expect(custom.getByRole('textbox')).toHaveValue('Two weeks');
  await page.getByTestId('template-body').fill('Hi [company]! [why me]');
  await page.getByTestId('template-save').click();
  await expect(page.getByTestId('letter-template').getByRole('status')).toHaveText('Saved.');
  await page.getByTestId('onboarding-finish').click();
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(page.getByTestId('onboarding-banner')).toHaveCount(0);
  await page.goto('/en/profile');
  await expect(salary.getByRole('textbox')).toHaveValue('$4000–4500 per month');
  await expect(page.getByTestId('template-body')).toHaveValue('Hi [company]! [why me]');
  await expect(custom.getByRole('textbox')).toHaveValue('Two weeks');
});
