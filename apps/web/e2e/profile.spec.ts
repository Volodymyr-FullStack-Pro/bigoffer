import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test.beforeEach(async ({ context }) => {
  await loginAs(context, uniqueEmail('profile'));
});

test('saves profile and keeps values after reload', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('GitHub').fill('https://github.com/test-user');
  await page.getByTestId('profile-save').click();
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Test User');
  await expect(page.getByLabel('GitHub')).toHaveValue('https://github.com/test-user');
});

test('shows invalid fields', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('GitHub').fill('not-a-url');
  await page.getByTestId('profile-save').click();
  await expect(page.locator('form').getByRole('status')).toContainText('contacts.github');
});

test('saves the country of residence', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('Country of residence').selectOption('UA');
  await page.getByTestId('profile-save').click();
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
});
