import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('creates a search profile and keeps it after reload', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search'));
  await page.goto('/en/search');
  await page.getByLabel('Profile name').fill('Full-Stack remote');
  await page.getByLabel('Role keywords').fill('full stack, react developer');
  await page.getByLabel('Your skills').fill('React, Node.js, PostgreSQL');
  await page.getByLabel('Senior').check();
  await page.getByLabel('Work format').selectOption('remote');
  await page.getByTestId('search-save').click();
  // the "new profile" form is replaced by the saved profile's form + an "add" link
  await expect(page.getByTestId('search-add')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Role keywords').first()).toHaveValue('full stack, react developer');
  await page.getByLabel('Your skills').first().fill('React, Node.js');
  await page.getByTestId('search-save').first().click();
  await expect(page.getByRole('status').first()).toContainText('Saved');
});

test('adding a second profile returns to the plain search URL', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-second'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('full stack');
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-add')).toBeVisible();
  await page.getByTestId('search-add').click();
  await expect(page).toHaveURL(/\/en\/search\?new=1$/);
  await page.getByLabel('Role keywords').last().fill('react developer');
  await page.getByTestId('search-save').last().click();
  // a new profile redirects to /search, so a reload or a second click cannot create a duplicate
  await expect(page).toHaveURL(/\/en\/search$/);
  await expect(page.getByTestId('search-add')).toBeVisible();
  await expect(page.getByLabel('Role keywords')).toHaveCount(2);
});

test('rejects a profile without keywords', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-invalid'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('');
  await page.getByTestId('search-save').click();
  await expect(page.getByRole('status').first()).toContainText('keywords');
});
