import { describe, expect, it, vi } from 'vitest';
import {
  alertMessage,
  createBotApi,
  decodeCallback,
  digestMessage,
  encodeCallback,
  escapeHtml,
  overflowMessage,
  parseStart,
  telegramUpdateSchema,
  type AlertJob,
} from './index';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const job: AlertJob = {
  matchId: ID,
  title: 'Senior <b>Dev</b> & Co',
  company: 'Acme "Inc"',
  score: 87,
  salary: '$5k',
  location: 'Kyiv',
  remote: 'remote',
  why: 'Great stack',
};

describe('format', () => {
  it('escapes html', () => {
    expect(escapeHtml('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
  });

  it('builds uk alert with url and callbacks, escaping the title', () => {
    const { text, replyMarkup } = alertMessage(job, 'uk', 'https://x.test/');
    expect(text.startsWith('🔥 <b>87%</b> · Senior &lt;b&gt;Dev&lt;/b&gt; &amp; Co')).toBe(true);
    expect(text).toContain('Acme &quot;Inc&quot;');
    const flat = replyMarkup.inline_keyboard.flat();
    expect(flat).toContainEqual({ text: 'Відкрити', url: `https://x.test/uk/today?match=${ID}` });
    expect(flat).toContainEqual({ text: 'Сховати', callback_data: `h:${ID}` });
    expect(flat).toContainEqual({ text: 'Відгукнувся', callback_data: `a:${ID}` });
  });

  it('truncates long why without cutting entities', () => {
    const { text } = alertMessage({ ...job, why: '<'.repeat(1000) }, 'en', 'https://x.test');
    expect(text.length).toBeLessThan(4096);
    expect(text).not.toMatch(/&(?!lt;|gt;|amp;|quot;)/);
    expect(text).not.toMatch(/&[a-z]*$/m);
  });

  it('omits missing fields', () => {
    const { text } = alertMessage({ ...job, company: null, salary: null, location: null, remote: null, why: null }, 'en', 'https://x.test');
    expect(text.split('\n')).toHaveLength(1);
  });

  it('overflow and digest per locale', () => {
    expect(overflowMessage(3, 'uk', 'https://x.test')).toContain('ще 3 нові вакансії у BigOffer');
    expect(overflowMessage(1, 'en', 'https://x.test')).toContain('1 more new job in BigOffer');
    const d = digestMessage({ total: 12, top: [job], followUps: [{ company: 'A<B', title: 'T' }] }, 'uk', 'https://x.test');
    expect(d.text).toContain('Дайджест: 12 нових вакансій за добу');
    expect(d.text).toContain('Пора нагадати про себе');
    expect(d.text).toContain('A&lt;B');
    expect(d.replyMarkup.inline_keyboard[0]?.[0]).toEqual({ text: 'Відкрити', url: 'https://x.test/uk/today' });
    expect(digestMessage({ total: 0, top: [], followUps: [] }, 'ru', 'https://x.test').text).toContain('нет');
  });
});

describe('callback codec', () => {
  it('round-trips and stays within 64 bytes', () => {
    for (const kind of ['hide', 'applied'] as const) {
      const data = encodeCallback({ kind, matchId: ID });
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
      expect(decodeCallback(data)).toEqual({ kind, matchId: ID });
    }
  });
  it('rejects bad input', () => {
    expect(decodeCallback('h:not-a-uuid')).toBeNull();
    expect(decodeCallback(`x:${ID}`)).toBeNull();
    expect(decodeCallback('')).toBeNull();
  });
});

describe('update schema and /start', () => {
  it('accepts message and callback samples', () => {
    expect(telegramUpdateSchema.safeParse({ update_id: 1, message: { text: '/start', chat: { id: 5 }, from: { language_code: 'uk' } } }).success).toBe(true);
    expect(telegramUpdateSchema.safeParse({ update_id: 2, callback_query: { id: 'c', data: `h:${ID}`, message: { message_id: 9, chat: { id: 5 } } } }).success).toBe(true);
  });
  it('rejects without update_id', () => {
    expect(telegramUpdateSchema.safeParse({ message: { chat: { id: 5 } } }).success).toBe(false);
  });
  it('parses /start token', () => {
    const token = 'A'.repeat(42) + '_';
    expect(parseStart('/start abc')).toBeNull();
    expect(parseStart('/start')).toBeNull();
    expect(parseStart(`/start ${token}`)).toEqual({ token });
    expect(parseStart(`/start ${token}x`)).toBeNull();
  });
});

describe('bot api', () => {
  it('is a no-op without token', async () => {
    const fetchImpl = vi.fn();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const api = createBotApi(undefined, fetchImpl as unknown as typeof fetch);
    expect(await api.sendMessage(1, 'hi')).toEqual({ ok: true });
    expect(await api.clearButtons(1, 2)).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it('posts correct url and body', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const api = createBotApi('TOK', fetchImpl as unknown as typeof fetch);
    const kb = { inline_keyboard: [] };
    expect(await api.sendMessage(7, 'hi', kb)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botTOK/sendMessage');
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: 7, text: 'hi', parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
    await api.answerCallback('cb', 'ok');
    await api.clearButtons(7, 3);
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls[1]?.[0]).toMatch(/answerCallbackQuery$/);
    expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({ callback_query_id: 'cb', text: 'ok' });
    expect(calls[2]?.[0]).toMatch(/editMessageReplyMarkup$/);
    expect(JSON.parse(calls[2]?.[1].body as string)).toEqual({ chat_id: 7, message_id: 3, reply_markup: { inline_keyboard: [] } });
  });

  it('maps 403 to blocked and other failures without leaking the token', async () => {
    const blocked = createBotApi('TOK', (async () => new Response('', { status: 403 })) as typeof fetch);
    expect(await blocked.sendMessage(1, 'x')).toEqual({ ok: false, blocked: true, status: 403 });
    const failing = createBotApi('SECRET', (async () => {
      throw new Error('fail https://api.telegram.org/botSECRET/sendMessage');
    }) as typeof fetch);
    const r = await failing.sendMessage(1, 'x');
    expect(r).toEqual({ ok: false, blocked: false, status: 0 });
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });
});
