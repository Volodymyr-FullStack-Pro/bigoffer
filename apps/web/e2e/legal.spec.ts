import { expect, test } from '@playwright/test';

const EMAIL = 'babihuk888@gmail.com';
const H1 = {
  en: { privacy: 'Privacy Policy', terms: 'Terms of Service', link: 'Privacy' },
  uk: { privacy: 'Політика конфіденційності', terms: 'Умови використання', link: 'Конфіденційність' },
  ru: { privacy: 'Политика конфиденциальности', terms: 'Условия использования', link: 'Конфиденциальность' },
} as const;

for (const locale of ['en', 'uk', 'ru'] as const) {
  for (const page of ['privacy', 'terms'] as const) {
    test(`${page} page loads signed out in ${locale}`, async ({ page: p }) => {
      await p.goto(`/${locale}/${page}`);
      await expect(p).toHaveURL(new RegExp(`/${locale}/${page}$`));
      await expect(p.getByRole('heading', { level: 1, name: H1[locale][page] })).toBeVisible();
      await expect(p.getByRole('link', { name: EMAIL })).toBeVisible();
    });
  }
}

test('login page links to privacy and terms', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByRole('link', { name: H1.en.link, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  await page.goto('/en/login');
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/terms$/);
});
