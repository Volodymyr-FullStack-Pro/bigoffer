import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedMatch } from './helpers/seed';

test('the Offer Genie greets a new user, can be folded and remembers it, and follows the profile settings', async ({ context, page }) => {
  await context.addInitScript(() => localStorage.setItem('bigoffer:genie:e2e', '1'));
  const email = uniqueEmail('genie');
  await loginAs(context, email);
  await page.goto('/en/today');
  // No search profile yet: the genie asks to set one up.
  const bubble = page.getByTestId('genie-bubble');
  await expect(bubble).toContainText('Set up your search');
  await expect(page.getByTestId('genie-goal')).toHaveText('0/5');
  await page.getByTestId('genie-fold').click();
  await expect(page.getByTestId('genie-lamp')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('genie-lamp')).toBeVisible();
  await page.getByTestId('genie-lamp').click();
  await expect(page.getByTestId('genie-avatar')).toBeVisible();

  // Profile settings: a goal of 3 shows up on the ring; "off" removes the genie.
  await page.goto('/en/profile');
  // The setting is saved by a server action; leaving the page before it answers would abort it.
  const saved = () => page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/en/profile'));
  let done = saved();
  await page.getByTestId('genie-goal-input').fill('3');
  await done;
  await expect.poll(async () => {
    await page.goto('/en/today');
    return page.getByTestId('genie-goal').textContent();
  }).toBe('0/3');
  await page.goto('/en/profile');
  done = saved();
  await page.getByTestId('genie-mode-off').click();
  await done;
  await expect.poll(async () => {
    await page.goto('/en/today');
    return page.getByTestId('genie').count();
  }).toBe(0);
});

test('applying from the feed makes the genie cheer', async ({ context, page, isMobile }) => {
  await context.addInitScript(() => localStorage.setItem('bigoffer:genie:e2e', '1'));
  const email = uniqueEmail('genie-cheer');
  await loginAs(context, email);
  await seedMatch(email, { score: 90 });
  await page.goto('/en/today');
  if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
  await page.getByTestId('match-applied').filter({ visible: true }).first().click();
  await expect(page.getByTestId('genie-bubble')).toHaveAttribute('data-kind', 'celebrate');
  await expect(page.getByTestId('genie-goal')).toHaveText('1/5');
});
