import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test.beforeEach(async ({ context }) => {
  await loginAs(context, uniqueEmail('profile'));
});

test('saves profile and keeps values after reload', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('GitHub').fill('https://github.com/test-user');
  await page.getByLabel('Time zone').fill('Europe/Warsaw');
  await page.getByTestId('profile-save').click();
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  // The form must keep the saved values right after the save, not revert to the initial ones.
  await expect(page.getByLabel('Full name')).toHaveValue('Test User');
  await expect(page.getByLabel('GitHub')).toHaveValue('https://github.com/test-user');
  await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Warsaw');
  await page.reload();
  await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Warsaw');
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
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
  await expect(page.getByLabel('Country of residence').locator('option:checked')).toHaveText('Ukraine');
  // Saving again without changes keeps the selection too.
  await page.getByTestId('profile-save').click();
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
  await page.reload();
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
});

test('answer bank: per-row save feedback and presets', async ({ page }) => {
  await page.goto('/en/profile');
  const english = page.locator('[data-testid="bank-answer"][data-key="english"]');
  await english.getByLabel('English level', { exact: true }).selectOption('C1 (Advanced)');
  await english.getByTestId('bank-save').click();
  await expect(english.getByTestId('bank-row-status')).toHaveText('✓ Saved.');

  const format = page.locator('[data-testid="bank-answer"][data-key="work_format"]');
  await format.getByLabel('Preferred work format', { exact: true }).selectOption({ label: 'Other…' });
  await format.getByRole('textbox').fill('Remote, EU time zones');
  await format.getByTestId('bank-save').click();
  await expect(format.getByTestId('bank-row-status')).toHaveText('✓ Saved.');
  // Editing again clears the saved indicator.
  await format.getByRole('textbox').fill('Remote, EU time zones only');
  await expect(format.getByTestId('bank-row-status')).toHaveText('');

  const salary = page.locator('[data-testid="bank-answer"][data-key="salary"]');
  await expect(salary.getByRole('textbox')).toHaveAttribute('placeholder', /\$2,500–3,500\/month/);

  await page.reload();
  await expect(english.getByLabel('English level', { exact: true })).toHaveValue('C1 (Advanced)');
  await expect(format.getByLabel('Preferred work format', { exact: true })).toHaveValue('__other__');
  await expect(format.getByRole('textbox')).toHaveValue('Remote, EU time zones');
});

test('letter template: recommended template fills the editor', async ({ page }) => {
  await page.goto('/en/profile');
  const section = page.getByTestId('letter-template');
  await section.getByRole('button', { name: 'Use recommended template' }).click();
  await expect(page.getByTestId('template-body')).toHaveValue(/^Hi \[Hiring manager name or team\],/);
  await expect(page.getByTestId('template-body')).toHaveValue(/\[Phone\] · \[LinkedIn\] · \[GitHub\]$/);
  await page.getByTestId('template-save').click();
  await expect(section.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await expect(page.getByTestId('template-body')).toHaveValue(/I can start immediately/);
});
