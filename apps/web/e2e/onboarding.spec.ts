import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('answer bank: long custom question can be added, edited and deleted', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('bank-long'));
  await page.goto('/en/onboarding');
  const bank = page.getByTestId('answer-bank');
  await bank.getByTestId('bank-add-question').fill('What is your preferred way of working with a distributed team across many time zones?');
  await bank.getByTestId('bank-add-answer').fill('Async first');
  await bank.getByTestId('bank-add').click();
  const row = page.locator('[data-testid="bank-answer"][data-key^="what_is_your_preferred_way_of_"]');
  await expect(row.getByRole('textbox')).toHaveValue('Async first');
  await row.getByRole('textbox').fill('Async first, calls when needed');
  await row.getByTestId('bank-save').click();
  await expect(row.getByTestId('bank-row-status')).toHaveText('✓ Saved.');
  await page.reload();
  await expect(row.getByRole('textbox')).toHaveValue('Async first, calls when needed');
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(bank.getByRole('status')).toHaveText('Deleted.');
  await expect(row).toHaveCount(0);
});

test('onboarding: answer bank, finish', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('onboarding'));
  await page.goto('/en/today');
  await page.getByTestId('onboarding-banner').click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  const salary = page.locator('[data-testid="bank-answer"][data-key="salary"]');
  await salary.getByRole('textbox').fill('$4000–4500 per month');
  await salary.getByTestId('bank-save').click();
  await expect(salary.getByTestId('bank-row-status')).toHaveText('✓ Saved.');
  await page.getByTestId('bank-add-question').fill('Notice period');
  await page.getByTestId('bank-add-answer').fill('Two weeks');
  await page.getByTestId('bank-add').click();
  const custom = page.locator('[data-testid="bank-answer"][data-key^="notice_period_"]');
  await expect(custom.getByRole('textbox')).toHaveValue('Two weeks');
  await expect(page.getByTestId('profiles-tip')).toBeVisible();
  await page.getByTestId('onboarding-finish').click();
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(page.getByTestId('onboarding-banner')).toHaveCount(0);
  await page.goto('/en/profile');
  await expect(salary.getByRole('textbox')).toHaveValue('$4000–4500 per month');
  await expect(custom.getByRole('textbox')).toHaveValue('Two weeks');
});
