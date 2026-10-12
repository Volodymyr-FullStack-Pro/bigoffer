import type { InlineKeyboard } from './format';

export type BotResult = { ok: true } | { ok: false; blocked: boolean; status: number };

export type BotApi = {
  sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboard): Promise<BotResult>;
  answerCallback(id: string, text?: string): Promise<BotResult>;
  clearButtons(chatId: number, messageId: number): Promise<BotResult>;
  /** Telegram's command menu ("/" and the Menu button), per user language; optional for test fakes. */
  setCommands?(commands: { command: string; description: string }[], languageCode?: string): Promise<BotResult>;
};

/** A Bot API call that hangs is aborted after this long and reported as a network failure. */
const TIMEOUT_MS = 10_000;

export function createBotApi(token: string | undefined, fetchImpl?: typeof fetch, timeoutMs = TIMEOUT_MS): BotApi {
  if (!token) {
    let logged = false;
    const noop = async (): Promise<BotResult> => {
      if (!logged) {
        logged = true;
        console.info('[telegram] TELEGRAM_BOT_TOKEN is not set; bot messages are not sent');
      }
      return { ok: true };
    };
    return { sendMessage: noop, answerCallback: noop, clearButtons: noop, setCommands: noop };
  }

  async function call(method: string, body: Record<string, unknown>): Promise<BotResult> {
    const doFetch = fetchImpl ?? globalThis.fetch;
    try {
      const res = await doFetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { ok: true };
      return { ok: false, blocked: res.status === 403, status: res.status };
    } catch {
      // Network error or timeout. Never surface the error object: its message may contain the request URL (and the token).
      return { ok: false, blocked: false, status: 0 };
    }
  }

  return {
    sendMessage: (chatId, text, replyMarkup) =>
      call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    answerCallback: (id, text) =>
      call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }),
    setCommands: (commands, languageCode) =>
      call('setMyCommands', { commands, ...(languageCode ? { language_code: languageCode } : {}) }),
    clearButtons: (chatId, messageId) =>
      call('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
  };
}
