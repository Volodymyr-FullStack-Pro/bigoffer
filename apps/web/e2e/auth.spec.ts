import { expect, test } from '@playwright/test';

// next-intl detects Accept-Language; use an unsupported browser locale so the default (en) applies.
test.describe('default locale', () => {
  test.use({ locale: 'fr-FR' });

  test('root redirects to default locale login when signed out', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('BigOffer').first()).toBeVisible();
  });
});

test.describe('browser language detection', () => {
  test.use({ locale: 'uk-UA' });

  test('Ukrainian browser lands on the Ukrainian login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/uk\/login$/);
    await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
  });
});

test('protected page redirects to login', async ({ page }) => {
  await page.goto('/en/board');
  await expect(page).toHaveURL(/\/en\/login$/);
});

test('magic link form confirms sending', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill('someone@e2e.test');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByRole('status')).toContainText('Check your inbox');
});
