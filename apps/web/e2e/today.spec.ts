import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedApplication, seedCv, seedMatch } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

/** Desktop: select the list item; mobile: expand the top card's details. Returns the visible detail. */
async function openDetail(page: Page, title: string, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: /^(Details|Деталі)$/ }).click();
  else await visible(page, 'job-match').filter({ hasText: title }).click();
  return visible(page, 'match-detail');
}

test('shows the empty state with a link to search settings', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('today-empty'));
  await page.goto('/en/today');
  await expect(page.getByTestId('today-empty')).toBeVisible();
  await page.getByRole('link', { name: 'Set up job search' }).click();
  await expect(page).toHaveURL(/\/en\/search$/);
});

test('lists a match with score and source link, and hides it', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('today');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 88 });
  await page.goto('/en/today');
  const item = visible(page, 'job-match').filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item.getByTestId('match-score')).toContainText('88%');
  const detail = await openDetail(page, title, isMobile);
  await expect(detail.getByRole('link', { name: /Open on DOU/ })).toHaveAttribute('href', /jobs\.dou\.ua/);
  await visible(page, 'match-hide').click();
  await expect(visible(page, 'job-match').filter({ hasText: title })).toHaveCount(0);
});

test('does not list matches of expired jobs', async ({ context, page }) => {
  const email = uniqueEmail('today-expired');
  await loginAs(context, email);
  const active = await seedMatch(email, { score: 70 });
  const expired = await seedMatch(email, { score: 90, status: 'expired' });
  await page.goto('/en/today');
  await expect(visible(page, 'job-match').filter({ hasText: active.title })).toBeVisible();
  await expect(visible(page, 'job-match').filter({ hasText: expired.title })).toHaveCount(0);
});

test('does not list matches of jobs the AI marked as not a job, even if already seen', async ({ context, page }) => {
  const email = uniqueEmail('today-notjob');
  await loginAs(context, email);
  const real = await seedMatch(email, { score: 70 });
  const notJob = await seedMatch(email, { score: 90, isJob: false, state: 'seen' });
  await page.goto('/en/today');
  await expect(visible(page, 'job-match').filter({ hasText: real.title })).toBeVisible();
  await expect(visible(page, 'job-match').filter({ hasText: notJob.title })).toHaveCount(0);
});

test('shows the AI summary, why it fits and matched skills first', async ({ context, page, isMobile }) => {
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
  await page.goto('/en/today');
  let card = await openDetail(page, title, isMobile);
  await expect(card.getByTestId('match-summary')).toHaveText('Fintech team building payments.');
  await expect(card.getByTestId('match-why')).toContainText('Kafka and the senior level match your search.');
  await expect(card.getByTestId('match-skill').first()).toHaveText('✓ Kafka');
  await expect(card.getByTestId('match-skill').first()).toHaveAttribute('data-matched', 'true');
  await expect(card).toContainText('Senior');

  await page.goto('/uk/today');
  card = await openDetail(page, title, isMobile);
  await expect(card.getByTestId('match-summary')).toHaveText('Фінтех-команда будує платежі.');
  await expect(card.getByTestId('match-why')).toContainText('Kafka and the senior level match your search.');
});

test('a job from a company already on the board is flagged in the feed', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('feed-company');
  await loginAs(context, email);
  const { title, company } = await seedMatch(email, { score: 88 });
  await seedApplication(email, { column: 'applied', title: 'Front-End Developer elsewhere', company, appliedDaysAgo: 1 });
  await page.goto('/en/today');
  const detail = await openDetail(page, title, isMobile);
  await expect(detail.getByTestId('company-on-board')).toContainText('Front-End Developer elsewhere');
});

test('the English a job asks for shows next to the experience, flagged when the CV level is lower', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('feed-english');
  await loginAs(context, email);
  await seedCv(email); // English B2 in the test CV
  const { title } = await seedMatch(email, { score: 88, description: 'Fluent English (C1) is required for daily client calls.' });
  await page.goto('/en/today');
  const detail = await openDetail(page, title, isMobile);
  await expect(detail.getByTestId('required-english')).toContainText('English C1');
  await expect(detail.getByTestId('required-english')).toHaveAttribute('data-gap', 'true');
});
