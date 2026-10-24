import { expect, test } from './helpers/test';
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
  await page.getByTestId('sources-recommended').click();
  await page.getByTestId('search-save').click();
  // the blank form is replaced by the stored search (it can now be deleted)
  await expect(page.getByTestId('search-delete')).toBeVisible();
  await page.reload();
  // Keywords are chips now: a comma list typed into the field becomes one chip per term.
  await expect(page.getByTestId('tag-chip').filter({ hasText: /^full stack$/ }).first()).toBeVisible();
  await expect(page.getByTestId('tag-chip').filter({ hasText: /^react developer$/ }).first()).toBeVisible();
  await page.getByLabel('Your skills').first().fill('React, Node.js');
  await page.getByTestId('search-save').first().click();
  await expect(page.getByRole('status').first()).toContainText('Saved');
});

test('there is one search: no "add another", the saved form stays the only one', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-one'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('full stack');
  await page.getByTestId('source-dou').check();
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-delete')).toBeVisible();
  await expect(page.getByTestId('search-add')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Role keywords')).toHaveCount(1);
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
  await page.getByTestId('source-dou').check();
  await page.getByTestId('source-robotaua').check();
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-delete')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('source-robotaua').first()).toBeChecked();
  await expect(page.getByTestId('source-djinni').first()).not.toBeChecked();
  await expect(page.getByTestId('source-dou').first()).toBeChecked();
});

test('a profile with no stored sources shows the three boards checked', async ({ context, page }) => {
  const email = uniqueEmail('search-null-sources');
  await loginAs(context, email);
  await seedProfileWithNullSources(email, 'office');
  await page.goto('/en/search');
  for (const id of ['dou', 'djinni', 'robotaua']) await expect(page.getByTestId(`source-${id}`).first()).toBeChecked();
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

test('a new profile starts with no boards; "main boards" picks DOU, Djinni and robota.ua', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-main-boards'));
  await page.goto('/en/search');
  await expect(page.locator('input[name="sources"]:checked')).toHaveCount(0);
  await page.getByTestId('sources-recommended').click();
  for (const id of ['dou', 'djinni', 'robotaua']) await expect(page.getByTestId(`source-${id}`)).toBeChecked();
  await expect(page.locator('input[name="sources"]:checked')).toHaveCount(3);
});

test('chips: suggestions add a term, × removes it, salary is picked from a list', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-chips'));
  await page.goto('/en/search');
  await page.getByTestId('role-frontend').check();
  // For a front-end search "react developer" is one of the recommended (★) keywords.
  await page.getByTestId('recommend-keywords').getByRole('button', { name: '★ react developer' }).click();
  await page.getByTestId('suggest-skills').getByRole('button', { name: '+ TypeScript' }).click();
  await page.getByLabel('Your skills').fill('Redux');
  await page.getByLabel('Your skills').press('Enter');
  await page.getByRole('button', { name: '× Redux' }).click();
  // A spelling variant of a skill already there is not added; the existing chip is pointed out.
  await page.getByLabel('Your skills').fill('typescript');
  await expect(page.getByTestId('duplicate-skills')).toHaveText('Already there: TypeScript');
  await page.getByLabel('Your skills').press('Enter');
  await expect(page.getByTestId('tag-chip').filter({ hasText: /^TypeScript$/ })).toHaveCount(1);
  // A new skill can be typed and added with the "+ Add" chip.
  await page.getByLabel('Your skills').fill('Effector');
  await page.getByTestId('add-typed-skills').click();
  await expect(page.getByTestId('tag-chip').filter({ hasText: /^Effector$/ })).toHaveCount(1);
  await page.getByTestId('salary-select').selectOption('2000');
  await page.getByTestId('source-dou').check();
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-delete')).toBeVisible();
  await page.reload();
  const chips = page.getByTestId('tag-chip');
  await expect(chips.filter({ hasText: /^react developer$/ })).toHaveCount(1);
  await expect(chips.filter({ hasText: /^TypeScript$/ })).toHaveCount(1);
  await expect(chips.filter({ hasText: /^Redux$/ })).toHaveCount(0);
  await expect(chips.filter({ hasText: /^Effector$/ })).toHaveCount(1);
  await expect(page.getByTestId('salary-select')).toHaveValue('2000');
});


test('an unchecked board stays off after saving, saving again and reloading', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-uncheck'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('react');
  for (const id of ['dou', 'djinni', 'robotaua']) await page.getByTestId(`source-${id}`).check();
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-delete')).toBeVisible();
  await page.reload();

  await page.getByTestId('source-robotaua').first().uncheck();
  await page.getByTestId('search-save').first().click();
  await expect(page.getByRole('status').first()).toContainText('Saved');
  // React resets a form after its action; the board must not come back on screen nor on the next save.
  await expect(page.getByTestId('source-robotaua').first()).not.toBeChecked();
  await page.getByTestId('search-save').first().click();
  await page.reload();
  await expect(page.getByTestId('source-robotaua').first()).not.toBeChecked();
  await expect(page.getByTestId('source-dou').first()).toBeChecked();
});
