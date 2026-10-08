import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedProfileWithNullSources } from './helpers/seed';

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

test('saves a chosen subset of job boards', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-sources'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('react');
  await page.getByLabel('Work format').selectOption('remote');
  for (const id of ['remoteok', 'remotive', 'himalayas', 'wwr', 'jobicy', 'workingnomads', 'hn', 'arbeitnow', 'justjoin', 'jooble', 'robotaua', 'olx', 'jobico', 'greenhouse', 'lever', 'ashby', 'workable', 'telegram']) {
    const box = page.getByTestId(`source-${id}`);
    if (await box.isChecked()) await box.uncheck();
  }
  await page.getByTestId('source-linkedin').check();
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-add')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('source-linkedin').first()).toBeChecked();
  await expect(page.getByTestId('source-remoteok').first()).not.toBeChecked();
  await expect(page.getByTestId('source-dou').first()).toBeChecked();
});

test('lists the company-board and Telegram sources for a new profile', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-new-sources'));
  await page.goto('/en/search');
  for (const id of ['greenhouse', 'lever', 'ashby', 'workable', 'telegram']) {
    await expect(page.getByTestId(`source-${id}`)).toBeVisible();
  }
});

test('an office profile with no stored sources shows office defaults', async ({ context, page }) => {
  const email = uniqueEmail('search-null-sources');
  await loginAs(context, email);
  await seedProfileWithNullSources(email, 'office');
  await page.goto('/en/search');
  await expect(page.getByTestId('source-remoteok').first()).not.toBeChecked();
  await expect(page.getByTestId('source-workua').first()).toBeChecked();
});

test('rejects a profile with no job boards selected', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-no-sources'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('react');
  for (const box of await page.locator('input[name="sources"]').all()) {
    if (await box.isChecked()) await box.uncheck();
  }
  await page.getByTestId('search-save').click();
  await expect(page.getByRole('status')).toContainText('sources');
  await expect(page.getByText('Pick at least one job board')).toBeVisible();
});

test('a new profile leaves rarely relevant sources off and flags them', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-low-yield'));
  await page.goto('/en/search');
  await expect(page.getByTestId('source-arbeitnow')).not.toBeChecked();
  await expect(page.getByTestId('low-yield-arbeitnow')).toHaveText('(rarely relevant)');
  await expect(page.getByTestId('source-djinni')).toBeChecked();
  await expect(page.getByTestId('low-yield-djinni')).toHaveCount(0);
});
