import { createHash, timingSafeEqual } from 'node:crypto';
import { type BotApi, botReplies, decodeCallback, isPrivateChat, parseStart, rankAtTop, type TelegramUpdate, telegramUpdateSchema, type TgLocale, toTgLocale } from '@jp/core';
import type { Database } from '@jp/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashLinkToken } from './telegram-link';

export type BotProfile = { id: string; locale: TgLocale; minScore: number; digestHour: number };

/** Every method is scoped to one user or one chat; the webhook never touches other rows. */
export type WebhookStore = {
  linkChat(tokenHash: string, chatId: number): Promise<string | null>;
  profileById(userId: string): Promise<BotProfile | null>;
  profileByChat(chatId: number): Promise<BotProfile | null>;
  unlinkChat(chatId: number): Promise<void>;
  ownsMatch(userId: string, matchId: string): Promise<boolean>;
  hideMatch(userId: string, matchId: string): Promise<void>;
  saveApplied(userId: string, matchId: string): Promise<void>;
};

/** The store is created lazily, only for a request that passed the secret check. */
type Deps = { secret: string | undefined; store: () => WebhookStore; bot: BotApi };
type Input = { secretHeader: string | null; readBody: () => Promise<unknown> };

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time comparison: both sides are hashed to equal-length buffers first. */
function secretMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || header === null) return false;
  return timingSafeEqual(digest(header), digest(secret));
}

const STOP_RE = /^\/stop(?:@\w+)?\s*$/;
const START_RE = /^\/start(?:@\w+)?(?:\s|$)/;
const BARE_START_RE = /^\/start(?:@\w+)?\s*$/;

export async function handleTelegramWebhook(input: Input, { secret, store: makeStore, bot }: Deps): Promise<{ status: 200 | 401 }> {
  if (!secretMatches(input.secretHeader, secret)) return { status: 401 };
  const store = makeStore();
  const parsed = telegramUpdateSchema.safeParse(await input.readBody().catch(() => null));
  // Garbage gets 200 too, so Telegram does not keep retrying it.
  if (!parsed.success) return { status: 200 };
  const update = parsed.data;

  try {
    const message = update.message;
    // Linking, /stop and buttons work only in a one-to-one chat with the bot.
    if (message?.text && isPrivateChat(message.chat)) {
      const chatId = message.chat.id;
      const text = message.text.trim();
      const fallback = toTgLocale(message.from?.language_code);
      if (START_RE.test(text)) {
        const start = parseStart(text);
        if (!start && BARE_START_RE.test(text)) {
          await bot.sendMessage(chatId, botReplies(fallback).howToLink);
        } else {
          const userId = start ? await store.linkChat(hashLinkToken(start.token), chatId) : null;
          const profile = userId ? await store.profileById(userId) : null;
          await bot.sendMessage(
            chatId,
            profile ? botReplies(profile.locale).welcome(profile.minScore, profile.digestHour) : botReplies(fallback).expired,
          );
        }
      } else if (STOP_RE.test(text)) {
        const profile = await store.profileByChat(chatId);
        if (profile) await store.unlinkChat(chatId);
        await bot.sendMessage(chatId, botReplies(profile?.locale ?? fallback).stopped);
      }
    }

    const cb = update.callback_query;
    if (cb) await handleCallback(cb, store, bot);
  } catch (err) {
    // Never log the update or the error message: they may carry the link token or user data.
    console.error('telegram webhook failed', err instanceof Error ? err.name : 'unknown');
  }
  return { status: 200 };
}

type Callback = NonNullable<TelegramUpdate['callback_query']>;

/** Every button press is answered (so the client stops spinning), even when the store fails. */
async function handleCallback(cb: Callback, store: WebhookStore, bot: BotApi): Promise<void> {
  let replies = botReplies('en');
  try {
    const action = cb.data ? decodeCallback(cb.data) : null;
    const chat = cb.message && isPrivateChat(cb.message.chat) ? cb.message.chat.id : undefined;
    const profile = action && chat !== undefined ? await store.profileByChat(chat) : null;
    replies = botReplies(profile?.locale ?? 'en');
    if (!action || !profile || !cb.message || !(await store.ownsMatch(profile.id, action.matchId))) {
      await bot.answerCallback(cb.id, replies.unavailable);
      return;
    }
    if (action.kind === 'hide') await store.hideMatch(profile.id, action.matchId);
    else await store.saveApplied(profile.id, action.matchId);
    await bot.answerCallback(cb.id, action.kind === 'hide' ? replies.hidden : replies.added);
    await bot.clearButtons(cb.message.chat.id, cb.message.message_id);
  } catch (err) {
    console.error('telegram callback failed', err instanceof Error ? err.name : 'unknown');
    await bot.answerCallback(cb.id, replies.unavailable);
  }
}

type Admin = SupabaseClient<Database>;

function fail(what: string, error: { code?: string } | null): never {
  const e = new Error(`${what} failed (${error?.code ?? 'unknown'})`);
  e.name = `StoreError:${what}`;
  throw e;
}

export function supabaseWebhookStore(admin: Admin): WebhookStore {
  const toProfile = (p: { id: string; locale: string; telegram_min_score: number; digest_hour: number }): BotProfile => ({
    id: p.id,
    locale: toTgLocale(p.locale),
    minScore: p.telegram_min_score,
    digestHour: p.digest_hour,
  });
  const PROFILE = 'id, locale, telegram_min_score, digest_hour';

  return {
    async linkChat(tokenHash, chatId) {
      const { data, error } = await admin.rpc('link_telegram', { p_token_hash: tokenHash, p_chat_id: chatId });
      if (error) fail('link', error);
      return data ?? null;
    },
    async profileById(userId) {
      const { data, error } = await admin.from('profiles').select(PROFILE).eq('id', userId).maybeSingle();
      if (error) fail('profile', error);
      return data ? toProfile(data) : null;
    },
    async profileByChat(chatId) {
      const { data, error } = await admin.from('profiles').select(PROFILE).eq('telegram_chat_id', chatId).maybeSingle();
      if (error) fail('profile', error);
      return data ? toProfile(data) : null;
    },
    async unlinkChat(chatId) {
      const { error } = await admin.from('profiles').update({ telegram_chat_id: null }).eq('telegram_chat_id', chatId);
      if (error) fail('unlink', error);
    },
    async ownsMatch(userId, matchId) {
      const { data, error } = await admin.from('job_matches').select('id').eq('id', matchId).eq('user_id', userId).maybeSingle();
      if (error) fail('match', error);
      return Boolean(data);
    },
    async hideMatch(userId, matchId) {
      const { error } = await admin.from('job_matches').update({ state: 'hidden' }).eq('id', matchId).eq('user_id', userId);
      if (error) fail('hide', error);
    },
    async saveApplied(userId, matchId) {
      // Top of the user's Applied column — the same rank the web "Applied" action uses.
      const { data: column, error: cErr } = await admin.from('board_columns').select('id').eq('user_id', userId).eq('key', 'applied').maybeSingle();
      if (cErr || !column) fail('column', cErr);
      const { data: first, error: rErr } = await admin
        .from('applications')
        .select('rank')
        .eq('user_id', userId)
        .eq('column_id', column.id)
        .order('rank')
        .limit(1)
        .maybeSingle();
      if (rErr) fail('rank', rErr);
      const { error } = await admin.rpc('bot_save_match', {
        p_user_id: userId,
        p_match_id: matchId,
        p_column_key: 'applied',
        p_rank: rankAtTop(first?.rank ?? null),
      });
      if (error) fail('save', error);
    },
  };
}
