import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test.beforeEach(async ({ context }) => {
  await loginAs(context, uniqueEmail('shell'));
});

test('shows today page with navigation in Ukrainian', async ({ page }) => {
  await page.goto('/uk/today');
  await expect(page.getByRole('heading', { name: 'Сьогодні' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Дошка' }).filter({ visible: true }).first(),
  ).toBeVisible();
});

test('switches language and keeps the page', async ({ page }) => {
  await page.goto('/uk/today');
  await page.getByTestId('locale-ru').click();
  await expect(page).toHaveURL(/\/ru\/today$/);
  await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await page.getByTestId('locale-en').click();
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('theme toggle cycles system → light → dark', async ({ page }) => {
  await page.goto('/en/today');
  const toggle = page.getByTestId('theme-toggle');
  await expect(toggle).toHaveAttribute('data-theme-current', 'system');
  await toggle.click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: `test-results/today-dark-${test.info().project.name}.png` });
});

test('navigates to board and signs out', async ({ page }) => {
  await page.goto('/en/today');
  await page.getByRole('link', { name: 'Board' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Application board' })).toBeVisible();
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/en\/login$/);
});
