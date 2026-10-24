import { expect, type Page, test } from './helpers/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { linkTelegramChat, matchState, profileLocale, seedMatch, telegramChatId } from './helpers/seed';

const SECRET = 'e2e-secret';
const WEBHOOK = '/api/telegram/webhook';
const headers = { 'x-telegram-bot-api-secret-token': SECRET };
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const randomChatId = () => 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);

test('connect shows a one-time t.me link', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('tg-connect'));
  await page.goto('/en/profile');
  const section = page.getByTestId('telegram-section');
  await section.getByTestId('telegram-connect').click();
  await expect(section.getByTestId('telegram-link')).toHaveAttribute('href', /^https:\/\/t\.me\/bigoffer_test_bot\?start=[A-Za-z0-9_-]{43}$/);
  await expect(section.getByTestId('telegram-link')).toHaveAttribute('target', '_blank');
});

test('connecting from the Russian UI makes Russian the bot language', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'locale write is device-independent');
  const email = uniqueEmail('tg-locale');
  await loginAs(context, email);
  expect(await profileLocale(email)).not.toBe('ru');
  await page.goto('/ru/profile');
  await page.getByTestId('telegram-connect').click();
  await expect(page.getByTestId('telegram-link')).toBeVisible();
  expect(await profileLocale(email)).toBe('ru');
});

test('/start with the link token connects the chat; /stop disconnects it', async ({ context, page, request, isMobile }) => {
  test.skip(isMobile, 'webhook flow is device-independent');
  const email = uniqueEmail('tg-start');
  await loginAs(context, email);
  await page.goto('/en/profile');
  await page.getByTestId('telegram-connect').click();
  const href = (await page.getByTestId('telegram-link').getAttribute('href'))!;
  const token = new URL(href).searchParams.get('start')!;
  const chatId = randomChatId();

  const res = await request.post(WEBHOOK, {
    headers,
    data: { update_id: 1, message: { message_id: 1, text: `/start ${token}`, chat: { id: chatId, type: 'private' } } },
  });
  expect(res.status()).toBe(200);
  expect(await telegramChatId(email)).toBe(chatId);

  await page.reload();
  await expect(page.getByTestId('telegram-connected')).toBeVisible();

  // The token is single-use: replaying it does not relink another chat.
  await request.post(WEBHOOK, { headers, data: { update_id: 2, message: { message_id: 2, text: `/start ${token}`, chat: { id: chatId + 1, type: 'private' } } } });
  expect(await telegramChatId(email)).toBe(chatId);

  await request.post(WEBHOOK, { headers, data: { update_id: 3, message: { message_id: 3, text: '/stop', chat: { id: chatId, type: 'private' } } } });
  expect(await telegramChatId(email)).toBeNull();
});

test('the Hide button hides the match from Today; a foreign chat cannot touch it', async ({ context, page, request, isMobile }) => {
  test.skip(isMobile, 'webhook flow is device-independent');
  const email = uniqueEmail('tg-hide');
  await loginAs(context, email);
  const chatId = randomChatId();
  await linkTelegramChat(email, chatId);
  const { matchId, title } = await seedMatch(email, { score: 90 });
  const press = (chat: number) =>
    request.post(WEBHOOK, { headers, data: { update_id: 4, callback_query: { id: 'cb', data: `h:${matchId}`, message: { message_id: 9, chat: { id: chat, type: 'private' } } } } });

  expect((await press(chatId + 1)).status()).toBe(200);
  expect(await matchState(matchId)).toBe('new');

  expect((await press(chatId)).status()).toBe(200);
  expect(await matchState(matchId)).toBe('hidden');
  await page.goto('/en/today');
  await expect(visible(page, 'job-match').filter({ hasText: title })).toHaveCount(0);
});

test('a wrong secret gets 401', async ({ request, isMobile }) => {
  test.skip(isMobile, 'webhook flow is device-independent');
  const res = await request.post(WEBHOOK, { headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, data: { update_id: 5 } });
  expect(res.status()).toBe(401);
  expect(await res.text()).toBe('');
  expect((await request.post(WEBHOOK, { data: { update_id: 5 } })).status()).toBe(401);
});

test('?match= opens that match first', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('tg-deeplink');
  await loginAs(context, email);
  await seedMatch(email, { score: 95 });
  const low = await seedMatch(email, { score: 60 });
  await page.goto(`/en/today?match=${low.matchId}`);
  // Desktop: the selected detail; mobile: the single swipe card on top.
  if (isMobile) await expect(visible(page, 'job-match')).toContainText(low.title);
  else await expect(visible(page, 'match-detail')).toContainText(low.title);
});
