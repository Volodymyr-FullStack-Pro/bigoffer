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

test('rejects a non-PDF file', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv-bad'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toHaveText('Choose a PDF file.');
});
