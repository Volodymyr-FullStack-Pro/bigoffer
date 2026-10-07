import { createHash } from 'node:crypto';
import type { BotApi } from '@jp/core';
import { describe, expect, it, vi } from 'vitest';
import { handleTelegramWebhook, type WebhookStore } from './telegram-webhook';

const SECRET = 'e2e-secret';
const TOKEN = 'A'.repeat(42) + '_';
const MATCH = '11111111-2222-4333-8444-555555555555';
const USER = '99999999-2222-4333-8444-555555555555';

function fakes(over: Partial<WebhookStore> = {}) {
  const store: WebhookStore = {
    linkChat: vi.fn(async () => USER),
    profileById: vi.fn(async () => ({ id: USER, locale: 'uk' as const, minScore: 80, digestHour: 9 })),
    profileByChat: vi.fn(async () => ({ id: USER, locale: 'en' as const, minScore: 75, digestHour: 9 })),
    unlinkChat: vi.fn(async () => {}),
    ownsMatch: vi.fn(async () => true),
    hideMatch: vi.fn(async () => {}),
    saveApplied: vi.fn(async () => {}),
    ...over,
  };
  const ok = async () => ({ ok: true as const });
  const bot = { sendMessage: vi.fn(ok), answerCallback: vi.fn(ok), clearButtons: vi.fn(ok) } satisfies BotApi;
  return { store, bot };
}

const run = (f: ReturnType<typeof fakes>, body: unknown, header: string | null = SECRET, secret: { value: string | undefined } = { value: SECRET }) =>
  handleTelegramWebhook({ secretHeader: header, readBody: async () => body }, { secret: secret.value, store: () => f.store, bot: f.bot });

const startUpdate = (text: string, type = 'private') => ({
  update_id: 1,
  message: { message_id: 3, text, chat: { id: 42, type }, from: { language_code: 'ru' } },
});
const callback = (data: string, type = 'private') => ({
  update_id: 2,
  callback_query: { id: 'cb1', data, message: { message_id: 7, chat: { id: 42, type } } },
});

describe('telegram webhook', () => {
  it('rejects a missing, wrong or unconfigured secret with 401 and does nothing', async () => {
    const f = fakes();
    expect(await run(f, startUpdate(`/start ${TOKEN}`), null)).toEqual({ status: 401 });
    expect(await run(f, startUpdate(`/start ${TOKEN}`), 'wrong')).toEqual({ status: 401 });
    expect(await run(f, startUpdate(`/start ${TOKEN}`), SECRET.slice(0, -1))).toEqual({ status: 401 });
    expect(await run(f, startUpdate(`/start ${TOKEN}`), '', { value: '' })).toEqual({ status: 401 });
    expect(await run(f, startUpdate(`/start ${TOKEN}`), SECRET, { value: undefined })).toEqual({ status: 401 });
    expect(f.store.linkChat).not.toHaveBeenCalled();
    expect(f.bot.sendMessage).not.toHaveBeenCalled();
  });

  it('creates the store only after the secret check', async () => {
    const f = fakes();
    const store = vi.fn(() => {
      throw new Error('SUPABASE_SECRET_KEY is not set');
    });
    const deps = { secret: SECRET, store, bot: f.bot };
    expect(await handleTelegramWebhook({ secretHeader: 'wrong', readBody: async () => startUpdate('/stop') }, deps)).toEqual({ status: 401 });
    expect(store).not.toHaveBeenCalled();
    await expect(handleTelegramWebhook({ secretHeader: SECRET, readBody: async () => startUpdate('/stop') }, deps)).rejects.toThrow();
  });

  it('ignores /start and /stop outside a private chat', async () => {
    const f = fakes();
    expect(await run(f, startUpdate(`/start ${TOKEN}`, 'group'))).toEqual({ status: 200 });
    await run(f, startUpdate('/stop', 'supergroup'));
    await run(f, startUpdate('/stop', 'channel'));
    expect(f.store.linkChat).not.toHaveBeenCalled();
    expect(f.store.unlinkChat).not.toHaveBeenCalled();
    expect(f.bot.sendMessage).not.toHaveBeenCalled();
  });

  it('answers "unavailable" to a button press outside a private chat', async () => {
    const f = fakes();
    await run(f, callback(`h:${MATCH}`, 'group'));
    expect(f.store.hideMatch).not.toHaveBeenCalled();
    expect(f.bot.answerCallback).toHaveBeenCalledWith('cb1', 'Unavailable');
  });

  it('answers "unavailable" when the store fails during a button press', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = fakes({ hideMatch: vi.fn(async () => { throw new Error('db down'); }) });
    expect(await run(f, callback(`h:${MATCH}`))).toEqual({ status: 200 });
    expect(f.bot.answerCallback).toHaveBeenCalledWith('cb1', 'Unavailable');
    expect(f.bot.clearButtons).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('answers 200 to an invalid body without any action', async () => {
    const f = fakes();
    expect(await run(f, { nope: true })).toEqual({ status: 200 });
    expect(await run(f, null)).toEqual({ status: 200 });
    expect(f.store.linkChat).not.toHaveBeenCalled();
    expect(f.bot.sendMessage).not.toHaveBeenCalled();
  });

  it('links the chat with the SHA-256 of the /start token and welcomes in the profile language', async () => {
    const f = fakes();
    expect(await run(f, startUpdate(`/start ${TOKEN}`))).toEqual({ status: 200 });
    expect(f.store.linkChat).toHaveBeenCalledWith(createHash('sha256').update(TOKEN).digest('hex'), 42);
    expect(f.store.profileById).toHaveBeenCalledWith(USER);
    expect(f.bot.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('80%'));
    expect(f.bot.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Готово'));
  });

  it('reports an expired token in the Telegram language', async () => {
    const f = fakes({ linkChat: vi.fn(async () => null) });
    await run(f, startUpdate(`/start ${TOKEN}`));
    expect(f.bot.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Ссылка устарела'));
  });

  it('explains how to link on a bare /start', async () => {
    const f = fakes();
    await run(f, startUpdate('/start'));
    expect(f.store.linkChat).not.toHaveBeenCalled();
    expect(f.bot.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('BigOffer'));
  });

  it('/stop unlinks the chat', async () => {
    const f = fakes();
    await run(f, startUpdate('/stop'));
    expect(f.store.unlinkChat).toHaveBeenCalledWith(42);
    expect(f.bot.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Notifications are off'));
  });

  it('hides an own match and clears the buttons', async () => {
    const f = fakes();
    await run(f, callback(`h:${MATCH}`));
    expect(f.store.ownsMatch).toHaveBeenCalledWith(USER, MATCH);
    expect(f.store.hideMatch).toHaveBeenCalledWith(USER, MATCH);
    expect(f.bot.answerCallback).toHaveBeenCalledWith('cb1', 'Hidden');
    expect(f.bot.clearButtons).toHaveBeenCalledWith(42, 7);
  });

  it('puts an own match on the board as applied', async () => {
    const f = fakes();
    await run(f, callback(`a:${MATCH}`));
    expect(f.store.saveApplied).toHaveBeenCalledWith(USER, MATCH);
    expect(f.bot.answerCallback).toHaveBeenCalledWith('cb1', 'Added to the board');
  });

  it('answers "unavailable" for a foreign match without changes', async () => {
    const f = fakes({ ownsMatch: vi.fn(async () => false) });
    expect(await run(f, callback(`h:${MATCH}`))).toEqual({ status: 200 });
    expect(f.store.hideMatch).not.toHaveBeenCalled();
    expect(f.store.saveApplied).not.toHaveBeenCalled();
    expect(f.bot.answerCallback).toHaveBeenCalledWith('cb1', 'Unavailable');
    expect(f.bot.clearButtons).not.toHaveBeenCalled();
  });

  it('answers "unavailable" for an unlinked chat or bad callback data', async () => {
    const f = fakes({ profileByChat: vi.fn(async () => null) });
    await run(f, callback(`a:${MATCH}`));
    await run(f, callback('x:garbage'));
    expect(f.store.ownsMatch).not.toHaveBeenCalled();
    expect(f.bot.answerCallback).toHaveBeenCalledTimes(2);
    expect(f.bot.answerCallback).toHaveBeenLastCalledWith('cb1', 'Unavailable');
  });

  it('still answers 200 when the store fails, without logging update data', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = fakes({ linkChat: vi.fn(async () => { throw new Error(`boom ${TOKEN}`); }) });
    expect(await run(f, startUpdate(`/start ${TOKEN}`))).toEqual({ status: 200 });
    expect(JSON.stringify(err.mock.calls)).not.toContain(TOKEN);
    err.mockRestore();
  });
});
