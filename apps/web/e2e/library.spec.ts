import { expect, type Page, test } from './helpers/test';
import { loginAs, uniqueEmail } from './helpers/auth';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('saves a link by topic, filters, edits and deletes it', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('library'));
  await page.goto('/en/library');
  await expect(visible(page, 'library-empty')).toBeVisible();
  await visible(page, 'link-title').fill('Event loop visualizer');
  await visible(page, 'link-topic').fill('JavaScript');
  await visible(page, 'link-url').fill('https://javascript-visualizator.vercel.app/');
  await visible(page, 'link-note').fill('Shows the call stack and queues');
  await visible(page, 'link-save').click();
  const item = visible(page, 'link-item').filter({ hasText: 'Event loop visualizer' });
  await expect(item).toContainText('JavaScript');
  await expect(item.getByRole('link')).toHaveAttribute('href', 'https://javascript-visualizator.vercel.app/');

  // The same link twice is refused.
  await visible(page, 'link-title').fill('Again');
  await visible(page, 'link-url').fill('https://javascript-visualizator.vercel.app/');
  await visible(page, 'link-save').click();
  await expect(visible(page, 'link-error')).toContainText('already in your library');

  await page.reload();
  await visible(page, 'link-filter').filter({ hasText: 'JavaScript' }).click();
  await expect(visible(page, 'link-item')).toHaveCount(1);
  await item.getByTestId('link-edit').click();
  await visible(page, 'link-edit-topic').fill('Browser');
  await visible(page, 'link-edit-save').click();
  // Its old topic is empty now: the list falls back to all links.
  await expect(visible(page, 'link-item').filter({ hasText: 'Event loop visualizer' })).toContainText('Browser');

  page.once('dialog', (d) => void d.accept());
  await visible(page, 'link-item').filter({ hasText: 'Event loop visualizer' }).getByTestId('link-delete').click();
  await expect(visible(page, 'link-item')).toHaveCount(0);
});
