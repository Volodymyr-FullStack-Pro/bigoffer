import { describe, expect, it, vi } from 'vitest';
import {
  alertMessage,
  botReplies,
  createBotApi,
  decodeCallback,
  digestMessage,
  encodeCallback,
  escapeHtml,
  isPrivateChat,
  overflowMessage,
  parseStart,
  telegramUpdateSchema,
  toTgLocale,
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
    expect(flat).toContainEqual({ text: 'Відкрити в BigOffer', url: `https://x.test/uk/today?match=${ID}` });
    expect(flat).toContainEqual({ text: 'Сховати', callback_data: `h:${ID}` });
    expect(flat).toContainEqual({ text: 'Подано', callback_data: `a:${ID}` });
  });

  it('shows the board and links the original posting (http(s) only)', () => {
    const { text, replyMarkup } = alertMessage({ ...job, source: 'Djinni', jobUrl: 'https://djinni.co/jobs/1' }, 'ru', 'https://x.test');
    expect(text).toContain('Acme &quot;Inc&quot; · Djinni');
    expect(replyMarkup.inline_keyboard[0]).toContainEqual({ text: 'Вакансия ↗', url: 'https://djinni.co/jobs/1' });
    const bad = alertMessage({ ...job, jobUrl: 'javascript:alert(1)' }, 'en', 'https://x.test');
    expect(bad.replyMarkup.inline_keyboard[0]).toHaveLength(1);
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
    expect(d.text).toContain('Час нагадати про себе');
    expect(d.text).toContain('A&lt;B');
    expect(d.replyMarkup.inline_keyboard[0]?.[0]).toEqual({ text: 'Відкрити в BigOffer', url: 'https://x.test/uk/today' });
    expect(digestMessage({ total: 0, top: [], followUps: [] }, 'ru', 'https://x.test').text).toContain('За сутки новых вакансий нет');
    expect(digestMessage({ total: 0, top: [], followUps: [] }, 'en', 'https://x.test').text).toContain('in the last 24 hours');
  });

  it('localizes the remote label and neutral Applied button', () => {
    expect(alertMessage(job, 'uk', 'https://x.test').text).toContain('Віддалено');
    expect(alertMessage({ ...job, remote: 'hybrid' }, 'ru', 'https://x.test').text).toContain('Гибрид');
    expect(alertMessage({ ...job, remote: 'office' }, 'en', 'https://x.test').text).toContain('Office');
    const applied = (locale: 'en' | 'uk' | 'ru') =>
      alertMessage(job, locale, 'https://x.test').replyMarkup.inline_keyboard.flat().find((b) => 'callback_data' in b && b.callback_data.startsWith('a:'))?.text;
    expect([applied('en'), applied('uk'), applied('ru')]).toEqual(['Applied', 'Подано', 'Отклик отправлен']);
  });

  it('caps the digest at 4096 UTF-16 units, dropping trailing items and keeping both sections', () => {
    const long = '"'.repeat(300);
    const top = Array.from({ length: 10 }, (_, i) => ({ ...job, matchId: ID, title: `${i}${long}`, company: long, score: 90 - i }));
    const followUps = Array.from({ length: 10 }, (_, i) => ({ company: `F${i}${long}`, title: long }));
    const { text } = digestMessage({ total: 40, top, followUps }, 'en', 'https://x.test');
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('Digest: 40 new jobs');
    expect(text).toContain('<b>90%</b> 0');
    expect(text).toContain('Time to follow up');
    expect(text).toContain('F0');
    expect(text).not.toContain('<b>81%</b>');
    expect(text).not.toContain('F9');
    expect(text).not.toMatch(/&[a-z]*$/m);
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
  it('parses chat.type; only private chats count', () => {
    const u = telegramUpdateSchema.parse({ update_id: 3, message: { text: '/stop', chat: { id: 5, type: 'group' } } });
    expect(u.message?.chat.type).toBe('group');
    expect(isPrivateChat(u.message?.chat)).toBe(false);
    expect(isPrivateChat({ type: 'private' })).toBe(true);
    expect(isPrivateChat({})).toBe(false);
    expect(isPrivateChat(undefined)).toBe(false);
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

  it('aborts a hanging call after the timeout', async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const api = createBotApi('TOK', hanging, 20);
    expect(await api.sendMessage(1, 'x')).toEqual({ ok: false, blocked: false, status: 0 });
  });

  it('passes an abort signal on every call', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const api = createBotApi('TOK', fetchImpl as unknown as typeof fetch);
    await api.sendMessage(1, 'x');
    await api.answerCallback('cb');
    await api.clearButtons(1, 2);
    for (const call of fetchImpl.mock.calls as unknown as [string, RequestInit][]) expect(call[1].signal).toBeInstanceOf(AbortSignal);
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

describe('bot replies', () => {
  it('maps locales and falls back to en', () => {
    expect(toTgLocale('uk')).toBe('uk');
    expect(toTgLocale('ru-RU')).toBe('ru');
    expect(toTgLocale('de')).toBe('en');
    expect(toTgLocale(null)).toBe('en');
  });
  it('formats the welcome text in each locale', () => {
    expect(botReplies('en').welcome(75, 9)).toContain('75%');
    expect(botReplies('en').welcome(75, 9)).toContain('09:00');
    expect(botReplies('uk').welcome(80, 18)).toContain('18:00');
    expect(botReplies('ru').unavailable).toBe('Недоступно');
  });
});

describe('alert extras', () => {
  it('encodes the save button and parses /pause', async () => {
    const { encodeCallback, decodeCallback, parsePauseMs } = await import('./format');
    const id = '0fe608a4-d9e3-4777-8de0-4f3f7d956da4';
    expect(decodeCallback(encodeCallback({ kind: 'save', matchId: id }))).toEqual({ kind: 'save', matchId: id });
    expect(parsePauseMs('/pause 3h')).toBe(3 * 3_600_000);
    expect(parsePauseMs('/pause 90m')).toBe(90 * 60_000);
    expect(parsePauseMs('/pause 1d')).toBe(86_400_000);
    expect(parsePauseMs('/pause 5m')).toBeNull();
    expect(parsePauseMs('/pause soon')).toBeNull();
  });
  it('labels army, reservation, level and fields, and adds the kit and save buttons', async () => {
    const { alertLabels, alertMessage } = await import('./format');
    expect(alertLabels({ domains: ['fintech', 'military'], perks: ['reservation', 'testTask'], seniority: 'middle' }, 'uk')).toEqual(['🪖 Армія', '🛡 Бронювання', 'Middle', 'Тестове', 'FinTech']);
    const msg = alertMessage({ matchId: '0fe608a4-d9e3-4777-8de0-4f3f7d956da4', title: 'Dev', company: 'Acme', score: 90, salary: null, location: null, remote: null, why: null, labels: ['🛡 Бронювання'] }, 'uk', 'https://x.app');
    expect(msg.text).toContain('🛡 Бронювання');
    const buttons = msg.replyMarkup.inline_keyboard.flat().map((b) => b.text);
    expect(buttons).toEqual(expect.arrayContaining(['✍️ Набір для відгуку', '⭐ Зберегти', 'Сховати', 'Подано']));
    expect(JSON.stringify(msg.replyMarkup)).toContain('kit=1');
  });
  it('knows quiet hours across midnight', async () => {
    const { inQuietHours } = await import('./format');
    expect(inQuietHours(23, 23, 8)).toBe(true);
    expect(inQuietHours(3, 23, 8)).toBe(true);
    expect(inQuietHours(8, 23, 8)).toBe(false);
    expect(inQuietHours(14, 13, 15)).toBe(true);
    expect(inQuietHours(10, 9, 9)).toBe(false);
  });
});

describe('genie in the digest', () => {
  it('reports yesterday, the streak and a motto; nudges after idle days', async () => {
    const { digestGenieLines, digestMessage } = await import('./format');
    const met = digestGenieLines({ yesterday: 5, goal: 5, streak: 3, idleDays: 0 }, 'uk', 1);
    expect(met[0]).toBe('🧞 Вчора: 5/5 — ціль виконано! 🎉');
    expect(met[1]).toBe('Серія: 🔥3 дн. поспіль');
    expect(met[2]).toMatch(/^<i>.+<\/i>$/);
    expect(digestGenieLines({ yesterday: 2, goal: 5, streak: 0, idleDays: 0 }, 'en')[0]).toContain('2/5');
    expect(digestGenieLines({ yesterday: 0, goal: 5, streak: 0, idleDays: 3 }, 'en')).toEqual([expect.stringContaining('3 days without applications')]);
    const msg = digestMessage({ total: 0, top: [], followUps: [], genie: met }, 'uk', 'https://x.app');
    expect(msg.text.startsWith('🧞 Вчора: 5/5')).toBe(true);
  });
});

describe('command menu', () => {
  it('registers the commands once per process, per language', async () => {
    const { ensureBotCommands, BOT_COMMANDS } = await import('./format');
    const calls: (string | undefined)[] = [];
    const bot = { setCommands: async (_c: unknown, lang?: string) => { calls.push(lang); return { ok: true }; } };
    await ensureBotCommands(bot);
    await ensureBotCommands(bot);
    expect(calls).toEqual([undefined, 'uk', 'ru']);
    expect(BOT_COMMANDS.uk.map((c) => c.command)).toEqual(['top', 'goal', 'pause', 'resume', 'help', 'stop']);
  });
});
