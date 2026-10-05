import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { applicationColumnKey, seedApplication } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const card = (page: Page, title: string) => visible(page, 'board-card').filter({ hasText: title });
const column = (page: Page, key: string) => page.locator(`[data-testid="board-column"][data-column-key="${key}"]`);

test('shows the six default columns with counters', async ({ context, page }) => {
  const email = uniqueEmail('board-columns');
  await loginAs(context, email);
  await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await expect(page.getByTestId('board-column')).toHaveCount(6);
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
  await card(page, title).click();
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
  await card(page, title).click();
  await expect(visible(page, 'panel-notes')).toHaveValue('Ask about the team size');
});

test('drags a card to another column with the mouse', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'mouse drag on desktop; touch uses long-press');
  const email = uniqueEmail('board-drag');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  const from = await card(page, title).boundingBox();
  const to = await column(page, 'test_task').boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 40, from!.y + 30, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(column(page, 'test_task').getByText(title)).toBeVisible();
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
  await expect(column(page, 'saved').getByText('Fullstack Developer (manual)')).toBeVisible();
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
