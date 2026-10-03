import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedMatch } from './helpers/seed';

test('shows the empty state with a link to search settings', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('today-empty'));
  await page.goto('/en/today');
  await expect(page.getByTestId('today-empty')).toBeVisible();
  await page.getByRole('link', { name: 'Set up job search' }).click();
  await expect(page).toHaveURL(/\/en\/search$/);
});

test('lists a match with score and source link, and hides it', async ({ context, page }) => {
  const email = uniqueEmail('today');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 88 });
  await page.goto('/en/today');
  const card = page.getByTestId('job-match').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('match-score')).toContainText('88%');
  await expect(card.getByRole('link', { name: /Open on DOU/ })).toHaveAttribute('href', /jobs\.dou\.ua/);
  await card.getByTestId('match-hide').click();
  await expect(page.getByTestId('job-match').filter({ hasText: title })).toHaveCount(0);
});

test('does not list matches of expired jobs', async ({ context, page }) => {
  const email = uniqueEmail('today-expired');
  await loginAs(context, email);
  const active = await seedMatch(email, { score: 70 });
  const expired = await seedMatch(email, { score: 90, status: 'expired' });
  await page.goto('/en/today');
  await expect(page.getByTestId('job-match').filter({ hasText: active.title })).toBeVisible();
  await expect(page.getByTestId('job-match').filter({ hasText: expired.title })).toHaveCount(0);
});

test('shows the AI summary, why it fits and matched skills first', async ({ context, page }) => {
  const email = uniqueEmail('today-ai');
  await loginAs(context, email);
  const { title } = await seedMatch(email, {
    score: 91,
    seniority: 'senior',
    skills: ['Docker', 'React', 'Kafka'],
    matchedSkills: ['Kafka'],
    summary: { en: 'Fintech team building payments.', uk: 'Фінтех-команда будує платежі.' },
    explanation: { en: 'Kafka and the senior level match your search.' },
  });
  const card = page.getByTestId('job-match').filter({ hasText: title });

  await page.goto('/en/today');
  await expect(card.getByTestId('match-summary')).toHaveText('Fintech team building payments.');
  await expect(card.getByTestId('match-why')).toContainText('Kafka and the senior level match your search.');
  await expect(card.getByTestId('match-skill').first()).toHaveText('Kafka');
  await expect(card.getByTestId('match-skill').first()).toHaveAttribute('data-matched', 'true');
  await expect(card).toContainText('Senior');

  await page.goto('/uk/today');
  await expect(card.getByTestId('match-summary')).toHaveText('Фінтех-команда будує платежі.');
  await expect(card.getByTestId('match-why')).toContainText('Kafka and the senior level match your search.');
});
