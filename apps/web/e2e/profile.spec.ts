import { expect, test } from './helpers/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test.beforeEach(async ({ context }) => {
  await loginAs(context, uniqueEmail('profile'));
});

test('saves profile and keeps values after reload', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('GitHub').fill('https://github.com/test-user');
  await page.getByLabel('Time zone').fill('Europe/Warsaw');
  await page.getByLabel('Time zone').blur();
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
  await page.getByLabel('GitHub').blur();
  await expect(page.locator('form').getByRole('status')).toContainText('contacts.github');
});

test('saves the country of residence', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('Country of residence').selectOption('UA');
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
  await expect(page.getByLabel('Country of residence').locator('option:checked')).toHaveText('Ukraine');
  // Leaving the field without changes keeps the selection too.
  await page.getByLabel('Country of residence').blur();
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
  await page.reload();
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
});

test('answer bank: per-row save feedback and presets', async ({ page }) => {
  await page.goto('/en/profile');
  const english = page.locator('[data-testid="bank-answer"][data-key="english"]');
  await english.getByLabel('English level', { exact: true }).selectOption('C1 (Advanced)');
  await expect(english.getByTestId('bank-row-status')).toHaveText('✓ Saved.');

  const format = page.locator('[data-testid="bank-answer"][data-key="work_format"]');
  await format.getByLabel('Preferred work format', { exact: true }).selectOption({ label: 'Other…' });
  await format.getByRole('textbox').fill('Remote, EU time zones');
  await format.getByRole('textbox').blur();
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


test('keeps a CV link among the contacts', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('CV link').fill('https://drive.google.com/file/d/abc/view');
  await page.getByLabel('CV link').blur();
  await expect(page.locator('form').getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('CV link')).toHaveValue('https://drive.google.com/file/d/abc/view');
});
