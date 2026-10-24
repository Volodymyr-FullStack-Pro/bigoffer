import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('uploads a CV, reads it with AI and creates a search from it', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles(path.join(__dirname, 'fixtures', 'cv.pdf'));
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toContainText('CV read');
  await page.reload();
  await expect(page.getByTestId('cv-headline')).toContainText('Full Stack Developer');
  const facts = page.getByTestId('cv-facts');
  await expect(facts.getByTestId('tag-chip').filter({ hasText: 'React' }).first()).toBeVisible();
  // The facts every job is checked against can be corrected in place and stay corrected.
  await facts.getByTestId('cv-facts-years').fill('4.5');
  await facts.getByTestId('cv-facts-english').filter({ hasText: 'C1' }).click();
  await facts.getByTestId('cv-facts-save').click();
  await expect(facts.getByTestId('cv-facts-status')).toContainText('Saved', { timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId('cv-facts-years')).toHaveValue('4.5');
  await expect(page.getByTestId('cv-facts-english').filter({ hasText: 'C1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cv-link')).toHaveAttribute('href', /token=/);
  await page.getByTestId('cv-fill-contacts').click();
  await expect(page.getByText('Contacts updated.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('LinkedIn').filter({ visible: true })).toHaveValue('https://www.linkedin.com/in/test-user');
  // The upload already built the search from the CV; the button rebuilds it.
  await page.goto('/en/search');
  await expect(page.getByLabel('Profile name')).toHaveValue('Full Stack Developer');
  await expect(page.getByTestId('search-delete')).toBeVisible();
  await page.goto('/en/profile');
  await page.getByTestId('cv-create-search').click();
  await expect(page).toHaveURL(/\/en\/search$/);
  await expect(page.getByLabel('Profile name')).toHaveCount(1);
  await expect(page.getByLabel('Profile name')).toHaveValue('Full Stack Developer');
});

test('deletes the CV: the block empties and the stored file is gone', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv-del'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles(path.join(__dirname, 'fixtures', 'cv.pdf'));
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toContainText('CV read');
  await page.reload();
  await page.getByTestId('cv-fill-contacts').click();
  await expect(page.getByText('Contacts updated.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('LinkedIn')).toHaveValue('https://www.linkedin.com/in/test-user');
  const href = await page.getByTestId('cv-link').getAttribute('href');
  expect(href).toBeTruthy();
  expect((await page.request.get(href!)).status()).toBe(200);
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('cv-delete').click();
  await expect(page.getByTestId('cv-status')).toHaveText('CV deleted.');
  await expect(page.getByTestId('cv-link')).toHaveCount(0);
  await expect(page.getByTestId('cv-delete')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('cv-headline')).toHaveCount(0);
  // Fields the CV filled in are cleared with it.
  await expect(page.getByLabel('LinkedIn').filter({ visible: true })).toHaveValue('');
  expect((await page.request.get(href!)).ok()).toBe(false);
  // The search built from that CV went with it.
  await page.goto('/en/search');
  await expect(page.getByTestId('search-delete')).toHaveCount(0);
  await expect(page.getByTestId('search-from-cv-hint')).toBeVisible();
});

test('rejects a non-PDF file', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv-bad'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toHaveText('Choose a PDF file.');
});

function pdfOfSize(bytes: number): Buffer {
  const base = readFileSync(path.join(__dirname, 'fixtures', 'cv.pdf'), 'latin1');
  const body = base.replace(/%%EOF\s*$/, '');
  const filler = `%${'x'.repeat(78)}\n`;
  const count = Math.max(0, Math.ceil((bytes - body.length) / filler.length));
  return Buffer.from(`${body}${filler.repeat(count)}%%EOF\n`, 'latin1');
}

test('uploads a 4.8 MB CV straight to Storage (above the 4.5 MB request cap)', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await loginAs(context, uniqueEmail('cv-4mb'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: pdfOfSize(4.8 * 1024 * 1024) });
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toContainText('CV read');
});

test('rejects a CV over 5 MB', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await loginAs(context, uniqueEmail('cv-5mb'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: pdfOfSize(5.5 * 1024 * 1024) });
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toHaveText('The file is larger than 5 MB.');
});
