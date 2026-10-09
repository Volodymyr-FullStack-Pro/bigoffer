import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('uploads a CV, reads it with AI and creates a search from it', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles(path.join(__dirname, 'fixtures', 'cv.pdf'));
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toContainText('CV read');
  await page.reload();
  await expect(page.getByTestId('cv-headline')).toContainText('Full Stack Developer');
  await expect(page.getByTestId('cv-skill').filter({ hasText: 'React' })).toBeVisible();
  await expect(page.getByTestId('cv-link')).toHaveAttribute('href', /token=/);
  await page.getByTestId('cv-fill-contacts').click();
  await expect(page.getByText('Contacts updated.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('LinkedIn')).toHaveValue('https://www.linkedin.com/in/test-user');
  await page.getByTestId('cv-create-search').click();
  await expect(page).toHaveURL(/\/en\/search$/);
  await expect(page.getByLabel('Profile name')).toHaveValue('Full Stack Developer');
});

test('deletes the CV: the block empties and the stored file is gone', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv-del'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles(path.join(__dirname, 'fixtures', 'cv.pdf'));
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toContainText('CV read');
  await page.reload();
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
  expect((await page.request.get(href!)).ok()).toBe(false);
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
