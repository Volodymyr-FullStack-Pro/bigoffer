import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { applicationColumnKey, seedApplication, seedCv } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const card = (page: Page, title: string) => visible(page, 'board-card').filter({ hasText: title });
// Moves a keyboard drag n columns right, waiting for dnd-kit to announce each step (key presses outrun its layout reads).
async function dragRight(page: Page, steps: number) {
  const live = page.locator('[aria-live]').filter({ hasText: /Draggable item/ });
  // The drag is only live once dnd-kit has announced the pick-up (it starts over the card itself).
  await expect(live.first()).toContainText('moved over');
  await page.waitForTimeout(200); // dnd-kit attaches its key listeners a tick after the announcement
  for (let i = 0; i < steps; i++) {
    const before = (await live.first().textContent()) ?? '';
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await live.first().textContent()) ?? '').not.toBe(before);
  }
}
const column = (page: Page, key: string) => page.locator(`[data-testid="board-column"][data-column-key="${key}"]`);

test('shows the seven default columns with counters', async ({ context, page }) => {
  const email = uniqueEmail('board-columns');
  await loginAs(context, email);
  await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await expect(page.getByTestId('board-column')).toHaveCount(7);
  await expect(column(page, 'saved').getByTestId('column-count')).toHaveText('1');
});

test('flags an old application and offers a ping action', async ({ context, page }) => {
  const email = uniqueEmail('board-urgency');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { appliedDaysAgo: 16 });
  await page.goto('/en/board');
  await expect(card(page, title).getByTestId('card-urgency')).toHaveAttribute('data-urgency', 'overdue');
  await expect(column(page, 'applied').getByTestId('column-count')).toContainText('1');
  const action = visible(page, 'today-action').filter({ hasText: title });
  await expect(action).toHaveAttribute('data-kind', 'ping');
  await action.getByRole('button').click();
  await expect(card(page, title).getByTestId('card-urgency')).toHaveCount(0);
});

test('moves a card through the panel and records history', async ({ context, page }) => {
  const email = uniqueEmail('board-move');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await card(page, title).click();
  // The move is optimistic; wait for the server action to land before reloading.
  await visible(page, 'panel-move').selectOption({ label: 'Interview' });
  await expect.poll(() => applicationColumnKey(id)).toBe('interview');
  await expect(column(page, 'interview').getByText(title)).toBeVisible();
  await page.reload();
  await expect(column(page, 'interview').getByText(title)).toBeVisible();
  // The reload keeps the card open.
  await expect(visible(page, 'card-panel')).toBeVisible();
  await expect(visible(page, 'panel-history')).toContainText('Moved');
});

test('moving to Rejected asks for reasons', async ({ context, page }) => {
  const email = uniqueEmail('board-reject');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 2 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-move').selectOption({ label: 'Rejected' });
  await expect(visible(page, 'reject-dialog')).toBeVisible();
  await expect(visible(page, 'reject-confirm')).toBeDisabled();
  await visible(page, 'reject-stage').selectOption('technical');
  await page.locator('[data-testid="reject-reason"][value="english"]').check();
  await visible(page, 'reject-confirm').click();
  await expect(column(page, 'rejected').getByText(title)).toBeVisible();
});

test('moving to Offer celebrates', async ({ context, page }) => {
  const email = uniqueEmail('board-offer');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'interview' });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-move').selectOption({ label: 'Offer' });
  await expect(column(page, 'offer').getByText(title)).toBeVisible();
  const reduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!reduced) await expect(page.getByTestId('confetti')).toBeAttached();
});

test('edits notes and labels in the panel', async ({ context, page }) => {
  const email = uniqueEmail('board-panel');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-notes').fill('Ask about the team size');
  await visible(page, 'panel-save').click();
  await visible(page, 'panel-label').filter({ hasText: 'Priority' }).click();
  await expect(visible(page, 'panel-label').filter({ hasText: 'Priority' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(card(page, title)).toContainText('Priority');
  await expect(visible(page, 'card-panel')).toBeVisible();
  await expect(visible(page, 'panel-notes')).toHaveValue('Ask about the team size');
});

test('drags a card to another column with the mouse', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'mouse drag on desktop; touch uses long-press');
  const email = uniqueEmail('board-drag');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  const from = await card(page, title).boundingBox();
  // A column on screen at the desktop width (seven columns scroll sideways).
  const to = await column(page, 'applied').boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 40, from!.y + 30, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(column(page, 'applied').getByText(title)).toBeVisible();
});

/** A finger on the screen, through Chrome's own touch events (Playwright's touchscreen only taps). */
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  return {
    async swipe(from: { x: number; y: number }, dx: number, dy: number) {
      await send('touchStart', from.x, from.y);
      for (let i = 1; i <= 10; i++) await send('touchMove', from.x + (dx * i) / 10, from.y + (dy * i) / 10);
      await send('touchEnd', from.x + dx, from.y + dy);
    },
    /** Long press, carry the card to the screen edge until `ready()` (the board scrolls under it), then drop mid-screen. */
    async holdAndCarry(from: { x: number; y: number }, edgeX: number, ready: () => Promise<boolean>, dropX: number) {
      await send('touchStart', from.x, from.y);
      await page.waitForTimeout(450);
      for (let i = 1; i <= 10; i++) await send('touchMove', from.x + ((edgeX - from.x) * i) / 10, from.y + 40);
      await expect.poll(ready, { timeout: 8000 }).toBe(true);
      for (let i = 1; i <= 5; i++) await send('touchMove', edgeX + ((dropX - edgeX) * i) / 5, from.y + 40);
      await page.waitForTimeout(150);
      await send('touchEnd', dropX, from.y + 40);
    },
  };
}

test('touch: a swipe scrolls the columns without moving the card; a long press drags it', async ({ context, page, isMobile }) => {
  test.skip(!isMobile, 'touch on the phone');
  const email = uniqueEmail('board-touch');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  const finger = await touch(page);
  const box = (await card(page, title).boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const scroller = page.getByTestId('board-column').first().locator('xpath=..');
  const before = await scroller.evaluate((el) => el.scrollLeft);
  // A quick sideways swipe that starts on the card: the board scrolls, the card stays in Saved.
  await finger.swipe(start, -220, 0);
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 50);
  expect(await applicationColumnKey(id)).toBe('saved');
  // The swipe's momentum and the column snap keep scrolling for a while: start the long press from a fresh board.
  await page.reload();
  await expect(card(page, title)).toBeInViewport();
  // Hold and carry the card to the edge, like a thumb would: the board scrolls until Applied is under the finger, then the
  // card is dropped there.
  const from = (await card(page, title).boundingBox())!;
  const width = page.viewportSize()!.width;
  const applied = column(page, 'applied');
  await finger.holdAndCarry({ x: from.x + 30, y: from.y + 20 }, width - 8, async () => ((await applied.boundingBox())?.x ?? width) < width / 2 - 40, width / 2);
  await expect.poll(() => applicationColumnKey(id)).toBe('applied');
});

test('keyboard: Enter opens the panel, Space drags to the next column', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'keyboard is a desktop feature');
  const email = uniqueEmail('board-keys');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  const target = card(page, title);
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(visible(page, 'card-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('card-panel')).toHaveCount(0);
  await target.focus();
  await page.keyboard.press('Space');
  const live = page.locator('[aria-live]').filter({ hasText: /Draggable item/ });
  await expect(live).toBeAttached();
  await page.keyboard.press('ArrowRight');
  await expect(live).toContainText('column:');
  await page.keyboard.press('Space');
  await expect.poll(() => applicationColumnKey(id)).not.toBe('saved');
  await expect(page.getByTestId('card-panel')).toHaveCount(0);
});

test('adds a card manually', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('board-add'));
  await page.goto('/en/board');
  await visible(page, 'add-card').click();
  await visible(page, 'add-title').fill('Fullstack Developer (manual)');
  await visible(page, 'add-company').fill('Initech');
  await visible(page, 'add-submit').click();
  await expect(column(page, 'saved').getByText('Fullstack Developer (manual)').filter({ visible: true }).first()).toBeVisible();
  await page.reload();
  await expect(column(page, 'saved').getByText('Fullstack Developer (manual)')).toBeVisible();
});

test('a blocked preview URL falls back to manual entry', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('board-ssrf'));
  await page.goto('/en/board');
  await visible(page, 'add-card').click();
  await visible(page, 'add-url').fill('http://127.0.0.1/');
  await visible(page, 'add-fetch').click();
  await expect(visible(page, 'add-preview-failed')).toBeVisible();
});

test('keyboard: dragging to Rejected focuses the reject dialog and Escape cancels', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'keyboard is a desktop feature');
  const email = uniqueEmail('board-keys-reject');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 2 });
  await page.goto('/en/board');
  const target = card(page, title);
  await target.focus();
  await page.keyboard.press('Space');
  // applied -> talking -> test_task -> interview -> offer -> rejected
  await dragRight(page, 5);
  await page.keyboard.press('Space');
  await expect(visible(page, 'reject-dialog')).toBeVisible();
  await expect(page.getByTestId('reject-stage')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reject-dialog')).toHaveCount(0);
  await expect(target).toBeFocused();
  expect(await applicationColumnKey(id)).toBe('applied');

  // Again, this time confirming with the keyboard only.
  await page.keyboard.press('Space');
  await dragRight(page, 5);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reject-stage')).toBeFocused();
  await page.keyboard.press('Tab'); // by
  await page.keyboard.press('Tab'); // first reason
  await expect(page.locator('[data-testid="reject-reason"]').first()).toBeFocused();
  await page.keyboard.press('Space');
  await page.getByTestId('reject-confirm').focus();
  await page.keyboard.press('Enter');
  await expect(column(page, 'rejected').getByText(title)).toBeVisible();
  await expect.poll(() => applicationColumnKey(id)).toBe('rejected');
});

test('search finds a card by company and the filter keeps drag targets', async ({ context, page }) => {
  const email = uniqueEmail('board-search');
  await loginAs(context, email);
  const { title: a } = await seedApplication(email, { column: 'applied', company: 'Solidgate' });
  const { title: b } = await seedApplication(email, { column: 'applied', company: 'Codebridge' });
  await page.goto('/en/board');
  await visible(page, 'board-search').fill('solid');
  await expect(card(page, a)).toBeVisible();
  await expect(card(page, b)).toHaveCount(0);
  await expect(visible(page, 'board-found')).toContainText('1 card found');
  await visible(page, 'board-search').press('Enter');
  await expect(visible(page, 'card-panel')).toContainText('Solidgate');
  await page.keyboard.press('Escape');
  await visible(page, 'board-search').fill('nobody here');
  await expect(visible(page, 'board-no-match')).toBeVisible();
  await visible(page, 'board-filter-clear').click();
  await expect(card(page, b)).toBeVisible();
});

test('a pasted auto-reply only tags the card; an interview invite moves it and sets the time', async ({ context, page }) => {
  const email = uniqueEmail('board-reply');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 3 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'reply-body').fill('Thank you! We have received your application and will review it.');
  await visible(page, 'reply-classify').click();
  await expect(visible(page, 'reply-kind').and(page.locator('[data-kind="auto_reply"]'))).toHaveAttribute('aria-checked', 'true');
  await visible(page, 'reply-save').click();
  await expect(visible(page, 'reply-saved')).toBeVisible();
  await expect(card(page, title).getByTestId('card-reply')).toContainText('Auto-reply');
  await expect(column(page, 'applied').getByText(title)).toBeVisible();

  await visible(page, 'reply-channel').and(page.locator('[data-channel="djinni"]')).click();
  await visible(page, 'reply-body').fill('Please book a ReactJS interview: calendly.com/acme/react');
  await visible(page, 'reply-link').fill('https://djinni.co/my/inbox/123/');
  await visible(page, 'reply-classify').click();
  await expect(visible(page, 'reply-author')).toHaveValue('Galina');
  await expect(visible(page, 'reply-when')).toHaveValue('2030-10-20T12:30');
  await expect(visible(page, 'reply-save')).toContainText('Interview');
  await visible(page, 'reply-save').click();
  await expect.poll(() => applicationColumnKey(id)).toBe('interview');
  await expect(visible(page, 'panel-history')).toContainText('Reply received');
  // The conversation reads oldest first: the auto-reply, then the invite from Galina on Djinni.
  await expect(visible(page, 'msg-item')).toHaveCount(2);
  await expect(visible(page, 'msg-item').last()).toContainText('Interview invite');
  await expect(visible(page, 'msg-item').last()).toContainText('Galina');
  await expect(visible(page, 'msg-item').last()).toContainText('Djinni');
  await expect(visible(page, 'panel-thread')).toHaveAttribute('href', 'https://djinni.co/my/inbox/123/');
  await page.keyboard.press('Escape');
  await expect(column(page, 'interview').locator(`[data-reply-kind="interview_invite"]`).filter({ hasText: title })).toBeVisible();
  await expect(card(page, title).getByTestId('card-next')).toContainText('20');
  await visible(page, 'filter-reply').and(page.locator('[data-kind="interview_invite"]')).click();
  await expect(card(page, title)).toBeVisible();
});

test('a recruiter question makes it your move until you answer', async ({ context, page }) => {
  const email = uniqueEmail('board-your-move');
  await loginAs(context, email);
  await seedCv(email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 2 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'reply-body').fill('Hi! Are you ready for a small test task?');
  await visible(page, 'reply-kind').and(page.locator('[data-kind="question"]')).click();
  await visible(page, 'reply-save').click();
  await expect(visible(page, 'panel-next-step')).toHaveAttribute('data-urgency', 'your_move');
  // A real answer moves the card from Applied to "In talks".
  await expect(column(page, 'talking').getByText(title)).toBeVisible();
  await expect(visible(page, 'today-action').and(page.locator('[data-kind="answer"]'))).toContainText(title);
  // Log my own answer in the conversation.
  await visible(page, 'reply-direction').and(page.locator('[data-direction="out"]')).click();
  await visible(page, 'reply-body').fill('Yes, happy to do it.');
  await visible(page, 'reply-save').click();
  await expect(visible(page, 'msg-item').last()).toHaveAttribute('data-direction', 'out');
  // A message logged by mistake can be removed.
  page.once('dialog', (d) => void d.accept());
  await visible(page, 'msg-item').last().getByTestId('msg-delete').click();
  await expect(visible(page, 'msg-item')).toHaveCount(1);
  await expect(visible(page, 'panel-next-step')).toHaveAttribute('data-urgency', 'your_move');
  await visible(page, 'reply-body').fill('Yes, happy to do it.');
  await visible(page, 'reply-save').click();
  await expect(visible(page, 'panel-next-step')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card(page, title).getByTestId('card-urgency')).toHaveCount(0);
});

test('a saved reply can be re-tagged; an auto-reply after all sends the card back to Applied', async ({ context, page }) => {
  const email = uniqueEmail('board-retag');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 1 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'reply-body').fill('Thanks for sharing your CV. We will take a look.');
  await visible(page, 'reply-kind').and(page.locator('[data-kind="other"]')).click();
  await visible(page, 'reply-save').click();
  await expect.poll(() => applicationColumnKey(id)).toBe('talking');
  await visible(page, 'msg-kind-edit').click();
  await visible(page, 'msg-kind-option').and(page.locator('[data-kind="auto_reply"]')).click();
  await expect.poll(() => applicationColumnKey(id)).toBe('applied');
  await expect(visible(page, 'msg-kind-edit')).toContainText('Auto-reply');
  // Only the tag changed: the message itself is all there.
  await expect(visible(page, 'msg-item')).toHaveCount(1);
  await expect(visible(page, 'msg-item')).toContainText('Thanks for sharing your CV');

  // A saved message can be corrected: channel and text.
  await visible(page, 'msg-edit').click();
  await visible(page, 'msg-edit-channel').and(page.locator('[data-channel="email"]')).click();
  await visible(page, 'msg-edit-body').fill('Thanks for sharing your CV. We will get back to you.');
  await visible(page, 'msg-edit-save').click();
  // The editor closes once the server has saved the change.
  await expect(visible(page, 'msg-edit-body')).toHaveCount(0, { timeout: 15_000 });
  await expect(visible(page, 'msg-item')).toContainText('Email');
  await expect(visible(page, 'msg-item')).toContainText('We will get back to you');
  await page.reload();
  await expect(visible(page, 'card-panel')).toBeVisible();
  await expect(visible(page, 'msg-item')).toContainText('We will get back to you');
});

test('a pasted rejection opens the reject dialog with the stage and reason the AI read', async ({ context, page }) => {
  const email = uniqueEmail('board-reject-ai');
  await loginAs(context, email);
  const { id, title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 4 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'reply-body').fill('Thank you for applying. We decided not to move forward with your candidacy.');
  await visible(page, 'reply-classify').click();
  await expect(visible(page, 'reply-kind').and(page.locator('[data-kind="rejection"]'))).toHaveAttribute('aria-checked', 'true');
  await visible(page, 'reply-save').click();
  await expect(visible(page, 'reject-suggested')).toBeVisible();
  await expect(visible(page, 'reject-stage')).toHaveValue('application');
  await expect(page.locator('[data-testid="reject-reason"][value="no_reason_given"]')).toBeChecked();
  await visible(page, 'reject-confirm').click();
  await expect.poll(() => applicationColumnKey(id)).toBe('rejected');
  // The reason shows on the card and in its panel.
  await expect(card(page, title).getByTestId('card-reject-reasons')).toContainText('No reason given');
  await page.reload();
  await expect(card(page, title).getByTestId('card-reject-reasons')).toContainText('No reason given');
  await expect(visible(page, 'card-panel')).toBeVisible();
  await expect(visible(page, 'panel-reject-reasons')).toContainText('No reason given');
});

test('a click on the page around the open card closes it', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'on a phone the panel covers the whole screen');
  const email = uniqueEmail('board-backdrop');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await card(page, title).click();
  await expect(visible(page, 'card-panel')).toBeVisible();
  // A click inside the panel keeps it open.
  await visible(page, 'card-panel').getByRole('heading', { name: title }).click();
  await expect(visible(page, 'card-panel')).toBeVisible();
  await page.mouse.click(20, 300);
  await expect(page.getByTestId('card-panel')).toHaveCount(0);
});

test('a Meet link in the invite becomes a Join button on the card, and can be edited', async ({ context, page }) => {
  const email = uniqueEmail('board-meet');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 2 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'reply-body').fill('Here is your invite. Join Google Meet: https://meet.google.com/xcg-ekku-yjg');
  await visible(page, 'reply-kind').and(page.locator('[data-kind="interview_invite"]')).click();
  await visible(page, 'reply-save').click();
  await expect(card(page, title).getByTestId('card-join')).toHaveAttribute('href', 'https://meet.google.com/xcg-ekku-yjg');
  await expect(visible(page, 'panel-join')).toHaveAttribute('href', 'https://meet.google.com/xcg-ekku-yjg');
  await expect(visible(page, 'panel-meeting')).toHaveValue('https://meet.google.com/xcg-ekku-yjg');
  await visible(page, 'panel-meeting').fill('https://us02web.zoom.us/j/123');
  await visible(page, 'panel-save').click();
  await expect(card(page, title).getByTestId('card-join')).toHaveAttribute('href', 'https://us02web.zoom.us/j/123');
  await page.reload();
  await expect(card(page, title).getByTestId('card-join')).toHaveAttribute('href', 'https://us02web.zoom.us/j/123');
});

test("an interview tomorrow is listed as coming up, not as today's task", async ({ context, page }) => {
  const email = uniqueEmail('board-coming-up');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'interview', appliedDaysAgo: 3, nextActionInHours: 30 });
  await page.goto('/en/board');
  await expect(visible(page, 'today-title')).toHaveText('Nothing due today ✓');
  await expect(visible(page, 'coming-up')).toContainText(title);
});

test('after an interview the card waits for feedback calmly, then asks for a reminder', async ({ context, page }) => {
  const email = uniqueEmail('board-feedback');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'interview', appliedDaysAgo: 6 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'feedback-start').click();
  await visible(page, 'feedback-preset').and(page.locator('[data-days="14"]')).click();
  await expect(visible(page, 'feedback-wait')).toContainText('14 days left');
  await expect(card(page, title).getByTestId('card-urgency')).toHaveAttribute('data-urgency', 'awaiting_feedback');
  await expect(card(page, title).getByTestId('card-urgency')).toContainText('Feedback · 14 days');
  await expect(visible(page, 'feedback-thanks')).toBeVisible();
  // The orange wait replaces the invite's badge.
  await expect(card(page, title).getByTestId('card-reply')).toHaveCount(0);
  await page.reload();
  await expect(card(page, title).getByTestId('card-urgency')).toHaveAttribute('data-urgency', 'awaiting_feedback');
  // Their answer ends the wait.
  await expect(visible(page, 'card-panel')).toBeVisible();
  await visible(page, 'reply-body').fill('Thank you! We would like to invite you to the technical interview.');
  await visible(page, 'reply-kind').and(page.locator('[data-kind="interview_invite"]')).click();
  await visible(page, 'reply-save').click();
  await expect(visible(page, 'feedback-start')).toBeVisible();
});

test('a past interview offers "Interview done" first, which starts a 7-day feedback wait', async ({ context, page }) => {
  const email = uniqueEmail('board-step-done');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'interview', appliedDaysAgo: 9 });
  await page.goto('/en/board');
  await card(page, title).click();
  await expect(visible(page, 'panel-next-step')).toHaveAttribute('data-urgency', 'step_done');
  await visible(page, 'panel-primary').and(page.locator('[data-action="step-done"]')).click();
  await expect(visible(page, 'feedback-wait')).toContainText('7 days left');
  await expect(card(page, title).getByTestId('card-urgency')).toHaveAttribute('data-urgency', 'awaiting_feedback');
});

test('a long column folds its quiet cards; the card panel has section navigation', async ({ context, page }) => {
  const email = uniqueEmail('board-fold');
  await loginAs(context, email);
  const titles: string[] = [];
  for (let i = 0; i < 14; i++) titles.push((await seedApplication(email, { column: 'saved' })).title);
  await page.goto('/en/board');
  const saved = column(page, 'saved');
  await expect(saved.getByTestId('board-card')).toHaveCount(12);
  await expect(saved.getByTestId('column-more')).toContainText('2 more cards');
  await saved.getByTestId('column-more').click();
  await expect(saved.getByTestId('board-card')).toHaveCount(14);
  // A search shows every match without folding.
  await saved.getByTestId('column-less').click();
  await visible(page, 'board-search').fill(titles[13]!);
  await expect(saved.getByTestId('board-card')).toHaveCount(1);

  await card(page, titles[13]!).click();
  await visible(page, 'panel-nav').and(page.locator('[data-section="history"]')).click();
  await expect(visible(page, 'panel-nav').and(page.locator('[data-section="history"]'))).toHaveAttribute('aria-current', 'true');
  // The panel scrolled down to the section (late-loading parts above can still shift it a little).
  await expect.poll(() => page.getByTestId('card-panel').evaluate((el) => el.scrollTop), { timeout: 10_000 }).toBeGreaterThan(200);
  await expect(visible(page, 'panel-history')).toBeInViewport({ ratio: 0.5 });
});

test('a batch of follow-ups folds into one line and can be marked at once', async ({ context, page }) => {
  const email = uniqueEmail('board-pings');
  await loginAs(context, email);
  for (let i = 0; i < 4; i++) await seedApplication(email, { column: 'applied', appliedDaysAgo: 9 });
  await page.goto('/en/board');
  const group = visible(page, 'today-pings');
  await expect(group).toContainText('Follow up: 4 companies');
  await expect(group.getByTestId('today-action')).toHaveCount(0);
  await group.getByTestId('today-pings-toggle').click();
  await expect(group.getByTestId('today-action')).toHaveCount(4);
  page.once('dialog', (d) => void d.accept());
  await group.getByTestId('today-pings-all').click();
  await expect(visible(page, 'today-pings')).toHaveCount(0);
  await page.reload();
  await expect(visible(page, 'today-pings')).toHaveCount(0);
});

test('reminder timing is set in the profile', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('reminder-rules'));
  await page.goto('/en/profile');
  await visible(page, 'reminder-first').selectOption('7');
  await visible(page, 'reminder-second').selectOption('14');
  await expect(visible(page, 'reminder-saved')).toBeVisible();
  await page.reload();
  await expect(visible(page, 'reminder-first')).toHaveValue('7');
  await expect(visible(page, 'reminder-second')).toHaveValue('14');
});

test('an upcoming interview can be added to the calendar; today actions fold away', async ({ context, page }) => {
  const email = uniqueEmail('board-calendar');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'interview', appliedDaysAgo: 3, nextActionInHours: 30 });
  await page.goto('/en/board');
  await card(page, title).click();
  await expect(visible(page, 'add-to-calendar')).toHaveAttribute('href', /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  await expect(visible(page, 'add-to-calendar-ics')).toHaveAttribute('href', /^data:text\/calendar/);
  await page.keyboard.press('Escape');
  await visible(page, 'today-toggle').click();
  await expect(visible(page, 'coming-up')).toHaveCount(0);
  await page.reload();
  await expect(visible(page, 'coming-up')).toHaveCount(0);
  await visible(page, 'today-toggle').click();
  await expect(visible(page, 'coming-up')).toContainText(title);
});

test('a reload keeps the open card and an unsaved message', async ({ context, page }) => {
  const email = uniqueEmail('board-reload');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 2 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'reply-body').fill('Thanks, I am free on Thursday.');
  await expect(page).toHaveURL(/card=/);
  await page.reload();
  await expect(visible(page, 'card-panel')).toBeVisible();
  await expect(visible(page, 'reply-body')).toHaveValue('Thanks, I am free on Thursday.');
});

test('contacts lists the recruiter from a board card and links back to the card', async ({ context, page }) => {
  const email = uniqueEmail('contacts');
  await loginAs(context, email);
  const { id } = await seedApplication(email, { title: 'Recruiter test', company: 'Acme Contacts', contactName: 'Olena Recruiter' });
  await page.goto('/en/contacts');
  const contact = page.getByTestId('contact').filter({ hasText: 'Olena Recruiter' });
  await expect(contact).toContainText('Acme Contacts');
  await contact.getByRole('link', { name: /Acme Contacts/ }).click();
  await expect(page).toHaveURL(new RegExp(`/en/board\\?card=${id}`));
});

test('the browser button opens the add dialog with the page it was pressed on', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('board-add-link'));
  await page.goto(`/en/board?add=${encodeURIComponent('https://example.com/careers/frontend')}&title=${encodeURIComponent('Frontend Engineer at Example')}`);
  const dialog = page.getByTestId('add-card-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('add-url')).toHaveValue(/example\.com/);
  await expect(dialog.getByTestId('add-title')).not.toHaveValue('');
});
