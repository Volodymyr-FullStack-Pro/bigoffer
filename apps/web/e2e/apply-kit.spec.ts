import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { applicationLetter, exhaustPrivateAi, seedBankAnswer, seedCardFromJob, seedCv, seedMatch } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function leaveAndReturn(page: Page) {
  const set = (state: 'hidden' | 'visible') =>
    page.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await set('hidden');
  await set('visible');
}

async function openKit(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
  await visible(page, 'apply-kit-open').click();
}

test('generates the apply kit, answers form questions from the bank and AI, marks applied', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit');
  await loginAs(context, email);
  await seedCv(email);
  await seedBankAnswer(email, 'salary', '$4000–4500 per month');
  const { title, jobId } = await seedMatch(email, { score: 90 });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await visible(page, 'kit-generate').click();
  await expect(visible(page, 'kit-letter')).toHaveValue(/full stack developer/i);
  await expect(visible(page, 'kit-requirement').filter({ hasText: 'Kubernetes' })).toHaveAttribute('data-status', 'missing');
  await expect(visible(page, 'kit-red-flag')).toContainText('Unpaid trial');
  await expect(visible(page, 'kit-short')).toContainText('[fake]');
  await expect(visible(page, 'contact-chip').filter({ hasText: 'CV link' })).toBeVisible();

  await visible(page, 'kit-form-input').fill('1. What are your salary expectations?\n2. Do you have Kubernetes experience?');
  await visible(page, 'kit-form-submit').click();
  await expect(visible(page, 'kit-answer').first()).toHaveAttribute('data-from-bank', 'true');
  await expect(visible(page, 'kit-answer').first().getByRole('textbox')).toHaveValue('$4000–4500 per month');
  await expect(visible(page, 'kit-answer').nth(1).getByRole('textbox')).toHaveValue('Fake answer 1');

  await visible(page, 'kit-copy-short').click();
  const popup = context.waitForEvent('page');
  await visible(page, 'kit-apply').click();
  const tab = await popup;
  await tab.close();
  await page.bringToFront();
  await expect(visible(page, 'kit-applied-yes')).toHaveCount(0);
  await leaveAndReturn(page);
  await visible(page, 'kit-applied-yes').click();
  await expect(page.getByText(`Marked as applied: ${title}`).filter({ visible: true })).toBeVisible();
  await expect.poll(() => applicationLetter(email, jobId)).toMatchObject({ kind: 'short', used: expect.stringContaining('[fake]') });
  await page.goto('/en/board');
  await expect(page.locator('[data-testid="board-column"][data-column-key="applied"]').getByText(title)).toBeVisible();
});

test('an exhausted daily AI limit blocks generation with an explanation', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-limit');
  await loginAs(context, email);
  await seedCv(email);
  await seedMatch(email, { score: 90 });
  await exhaustPrivateAi(email);
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await visible(page, 'kit-generate').click();
  await expect(visible(page, 'kit-error')).toContainText("Today's AI limit is used up");
  await expect(visible(page, 'kit-letter')).toHaveCount(0);
});

test('without a CV the kit explains what to do', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-nocv');
  await loginAs(context, email);
  await seedMatch(email, { score: 88 });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await expect(visible(page, 'kit-error')).toContainText('Upload your CV');
  await expect(visible(page, 'kit-generate')).toBeDisabled();
});

test('applying from the board card panel moves the card to Applied without reload', async ({ context, page }) => {
  const email = uniqueEmail('kit-board');
  await loginAs(context, email);
  await seedCv(email);
  const { title, jobId } = await seedMatch(email, { score: 90 });
  await seedCardFromJob(email, jobId, title);
  await page.goto('/en/board');
  const col = (key: string) => page.locator(`[data-testid="board-column"][data-column-key="${key}"]`);
  await expect(col('saved').getByText(title)).toBeVisible();
  await col('saved').getByText(title).click();
  const panel = page.getByTestId('card-panel');
  await panel.getByTestId('apply-kit-open').click();
  await panel.getByTestId('kit-generate').click();
  await expect(panel.getByTestId('kit-letter')).toHaveValue(/full stack developer/i);
  await panel.getByTestId('kit-copy-letter').click();
  const popup = context.waitForEvent('page');
  await panel.getByTestId('kit-apply').click();
  await (await popup).close();
  await leaveAndReturn(page);
  await panel.getByTestId('kit-applied-yes').click();
  await expect(panel.getByText('Moved to Applied.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(col('applied').getByText(title)).toBeVisible();
  await expect(col('saved').getByText(title)).toHaveCount(0);
  await expect.poll(() => applicationLetter(email, jobId)).toMatchObject({ kind: 'full' });
});

test('offers the contact the posting names', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-people');
  await loginAs(context, email);
  await seedCv(email);
  await seedMatch(email, { score: 90, description: 'React role. Send your CV to anna.hr@acme.io or Telegram: @anna_recruits' });
  await page.goto('/en/today');
  if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
  const contacts = visible(page, 'contact-recruiter');
  // The best contact shows first; the rest fold behind "1 more contact".
  await expect(contacts).toHaveCount(1);
  await visible(page, 'people-more').click();
  await expect(contacts).toHaveCount(2);
  await expect(contacts.first()).toHaveAttribute('href', 'mailto:anna.hr@acme.io');
  await expect(contacts.last()).toHaveAttribute('href', 'https://t.me/anna_recruits');
  await expect(contacts.last()).toHaveAttribute('target', '_blank');
  // With a choice of contacts, one is marked best; each has a ready message ending with the CV link.
  await expect(visible(page, 'recruiter-best')).toHaveCount(1);
  await visible(page, 'recruiter-write').first().click();
  await visible(page, 'recruiter-note-generate').click();
  await expect(visible(page, 'recruiter-note-body')).not.toHaveValue('');
});

test('no recruiter found: no contact block', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-people-none');
  await loginAs(context, email);
  await seedMatch(email, { score: 90, description: 'React, TypeScript, 3+ years' });
  await page.goto('/en/today');
  if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
  await expect(visible(page, 'match-detail')).toBeVisible();
  await expect(page.getByTestId('people-search')).toHaveCount(0);
});

test('writes a CV for the job with every change marked, lets flagged lines go, and opens it as a printable page', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-cv');
  await loginAs(context, email);
  await seedCv(email);
  const { jobId } = await seedMatch(email, { score: 90, skills: ['React', 'GraphQL', 'Kafka'] });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await visible(page, 'tailored-cv-generate').click();
  const paper = visible(page, 'cv-paper');
  await expect(paper).toContainText('Senior Full Stack Engineer [fake]');
  // Employers come from the CV itself; GraphQL (not in the CV) and the unverified line are both flagged.
  await expect(paper).toContainText('Acme');
  await expect(visible(page, 'tailored-cv-check')).toContainText('2 marks');
  // ATS keywords: the CV had React (1 of 3); the tailored one adds GraphQL (2 of 3); Kafka is still missing.
  await expect(visible(page, 'tailored-cv-ats-after')).toContainText('2 of 3');
  await expect(visible(page, 'tailored-cv-ats')).toContainText('Kafka');
  await visible(page, 'tailored-cv-remove').first().click();
  await expect(visible(page, 'tailored-cv-check')).toContainText('1 mark');
  await page.goto(`/en/cv/${jobId}`);
  await expect(page.getByTestId('cv-paper')).toContainText('Senior Full Stack Engineer [fake]');
  await expect(page.getByTestId('cv-print')).toBeVisible();
});
