import { expect, test } from '@playwright/test';
import { ensureUser, magicLinkConfirmPath, uniqueEmail } from './helpers/auth';
import { seedMatch } from './helpers/seed';

// next-intl detects Accept-Language; use an unsupported browser locale so the default (en) applies.
test.describe('default locale', () => {
  test.use({ locale: 'fr-FR' });

  test('root shows the landing in the default locale when signed out, and its button leads to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole('heading', { level: 1, name: 'We watch the boards. You watch the offer.' })).toBeVisible();
    await expect(page.getByLabel('BigOffer').first()).toBeVisible();
    await page.getByTestId('landing-start').click();
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('browser language detection', () => {
  test.use({ locale: 'uk-UA' });

  test('Ukrainian browser lands on the Ukrainian landing', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/uk$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ми дивимось на дошки. Ти — на офер.' })).toBeVisible();
  });
});

test('protected page redirects to login, keeping the page as next', async ({ page }) => {
  await page.goto('/en/board');
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fboard$/);
});

test('a signed-out Telegram deep link comes back to the match after the magic link', async ({ page, isMobile }) => {
  const email = uniqueEmail('deeplink-login');
  await ensureUser(email);
  const { matchId, title } = await seedMatch(email, { score: 60 });
  const target = `/uk/today?match=${matchId}`;

  await page.goto(target);
  await expect(page).toHaveURL(/\/uk\/login\?next=/);
  const next = new URL(page.url()).searchParams.get('next');
  expect(next).toBe(target);
  await expect(page.locator('input[type="hidden"][name="next"]')).toHaveValue(target);

  // Follow the email link without the redirect: it points at SITE_URL, which is not the E2E server.
  const res = await page.request.get(await magicLinkConfirmPath(email, next!), { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const location = new URL(res.headers().location!);
  expect(`${location.pathname}${location.search}`).toBe(target);

  await page.goto(`${location.pathname}${location.search}`);
  await expect(page).toHaveURL(new RegExp(`/uk/today\\?match=${matchId}$`));
  const visible = (id: string) => page.getByTestId(id).filter({ visible: true });
  if (isMobile) await expect(visible('job-match')).toContainText(title);
  else await expect(visible('match-detail')).toContainText(title);
});

test('an external next is ignored on the login page', async ({ page }) => {
  await page.goto('/en/login?next=//evil.test/x');
  await expect(page.locator('input[name="next"]')).toHaveCount(0);
});

test('magic link form confirms sending', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill('someone@e2e.test');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByRole('status')).toContainText('Check your inbox');
});

test('/auth/confirm with an invalid PKCE code redirects to the login error', async ({ page }) => {
  // The happy path (default Supabase template -> ?code=) needs the PKCE verifier cookie set by the
  // browser that requested the email, which admin generateLink cannot produce; the exchange itself is
  // the helper shared with /auth/callback.
  const res = await page.request.get('/auth/confirm?code=bogus&next=%2Fuk%2Ftoday', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers().location!).pathname + new URL(res.headers().location!).search).toBe('/uk/login?error=auth');
});

test('/auth/confirm without params redirects to the login error', async ({ page }) => {
  const res = await page.request.get('/auth/confirm', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers().location!).search).toBe('?error=auth');
});
