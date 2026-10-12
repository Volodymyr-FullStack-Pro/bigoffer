import { createHash, timingSafeEqual } from 'node:crypto';
import { type AlertJob, alertLabels, type BotApi, botReplies, ensureBotCommands, decodeCallback, detectDomains, detectPerks, isPrivateChat, parsePauseMs, parseStart, rankAtTop, sourceInfo, type TelegramUpdate, telegramUpdateSchema, type TgLocale, toTgLocale, topMessage } from '@jp/core';
import { streaks } from './genie/brain';
import { parseUiPrefs } from './ui-prefs';
import type { Database } from '@jp/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashLinkToken } from './telegram-link';

export type BotProfile = { id: string; locale: TgLocale; minScore: number; digestHour: number; timezone?: string };

/** Every method is scoped to one user or one chat; the webhook never touches other rows. */
export type WebhookStore = {
  linkChat(tokenHash: string, chatId: number): Promise<string | null>;
  profileById(userId: string): Promise<BotProfile | null>;
  profileByChat(chatId: number): Promise<BotProfile | null>;
  unlinkChat(chatId: number): Promise<void>;
  ownsMatch(userId: string, matchId: string): Promise<boolean>;
  hideMatch(userId: string, matchId: string): Promise<void>;
  saveApplied(userId: string, matchId: string): Promise<void>;
  saveSaved(userId: string, matchId: string): Promise<void>;
  /** The best fresh, not yet handled matches at or above the alert threshold. */
  topMatches(profile: BotProfile): Promise<AlertJob[]>;
  /** Today's applications against the Offer Genie goal, and the streak of goal days. */
  goal(userId: string): Promise<{ done: number; goal: number; streak: number }>;
  setPause(userId: string, until: string | null): Promise<void>;
};

/** The store is created lazily, only for a request that passed the secret check. */
type Deps = { secret: string | undefined; store: () => WebhookStore; bot: BotApi; siteUrl?: string };
type Input = { secretHeader: string | null; readBody: () => Promise<unknown> };

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time comparison: both sides are hashed to equal-length buffers first. */
function secretMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || header === null) return false;
  return timingSafeEqual(digest(header), digest(secret));
}

const STOP_RE = /^\/stop(?:@\w+)?\s*$/;
const TOP_RE = /^\/top(?:@\w+)?\s*$/;
const GOAL_RE = /^\/goal(?:@\w+)?\s*$/;
const HELP_RE = /^\/help(?:@\w+)?\s*$/;
const RESUME_RE = /^\/resume(?:@\w+)?\s*$/;
const PAUSE_RE = /^\/pause(?:@\w+)?(?:\s|$)/;
const START_RE = /^\/start(?:@\w+)?(?:\s|$)/;
const BARE_START_RE = /^\/start(?:@\w+)?\s*$/;

export async function handleTelegramWebhook(input: Input, { secret, store: makeStore, bot, siteUrl = '' }: Deps): Promise<{ status: 200 | 401 }> {
  if (!secretMatches(input.secretHeader, secret)) return { status: 401 };
  await ensureBotCommands(bot);
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
          const linked = await store.profileByChat(chatId);
          await bot.sendMessage(chatId, linked ? botReplies(linked.locale).help : botReplies(fallback).howToLink);
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
      } else if ([TOP_RE, GOAL_RE, HELP_RE, RESUME_RE, PAUSE_RE].some((re) => re.test(text))) {
        await handleCommand(text, chatId, fallback, store, bot, siteUrl);
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

/** /top, /goal, /help, /pause, /resume for a linked chat; an unlinked chat is told how to link. */
async function handleCommand(text: string, chatId: number, fallback: TgLocale, store: WebhookStore, bot: BotApi, siteUrl: string): Promise<void> {
  const profile = await store.profileByChat(chatId);
  if (!profile) {
    await bot.sendMessage(chatId, botReplies(fallback).howToLink);
    return;
  }
  const r = botReplies(profile.locale);
  if (HELP_RE.test(text)) await bot.sendMessage(chatId, r.help);
  else if (TOP_RE.test(text)) {
    const msg = topMessage(await store.topMatches(profile), profile.locale, siteUrl);
    await bot.sendMessage(chatId, msg.text, msg.replyMarkup);
  } else if (GOAL_RE.test(text)) {
    const g = await store.goal(profile.id);
    await bot.sendMessage(chatId, r.goal(g.done, g.goal, g.streak));
  } else if (RESUME_RE.test(text)) {
    await store.setPause(profile.id, null);
    await bot.sendMessage(chatId, r.resumed);
  } else {
    const ms = parsePauseMs(text);
    if (ms === null) {
      await bot.sendMessage(chatId, r.badPause);
      return;
    }
    const until = new Date(Date.now() + ms);
    await store.setPause(profile.id, until.toISOString());
    const shown = new Intl.DateTimeFormat(profile.locale === 'en' ? 'en-GB' : profile.locale, {
      timeZone: profile.timezone ?? 'Europe/Kyiv',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(until);
    await bot.sendMessage(chatId, r.paused(shown));
  }
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
    else if (action.kind === 'save') await store.saveSaved(profile.id, action.matchId);
    else await store.saveApplied(profile.id, action.matchId);
    await bot.answerCallback(cb.id, action.kind === 'hide' ? replies.hidden : action.kind === 'save' ? replies.saved : replies.added);
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
  const toProfile = (p: { id: string; locale: string; telegram_min_score: number; digest_hour: number; timezone: string }): BotProfile => ({
    id: p.id,
    locale: toTgLocale(p.locale),
    minScore: p.telegram_min_score,
    digestHour: p.digest_hour,
    timezone: p.timezone,
  });
  const PROFILE = 'id, locale, telegram_min_score, digest_hour, timezone';

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
      const { data, error } = await admin.from('job_matches').update({ state: 'hidden' }).eq('id', matchId).eq('user_id', userId).select('job_id');
      if (error) fail('hide', error);
      // Same cleanup as the web Hide: drop the apply kit unless the job is on the user's board.
      const jobId = data?.[0]?.job_id;
      if (jobId) {
        const { data: app } = await admin.from('applications').select('id').eq('user_id', userId).eq('job_id', jobId).maybeSingle();
        if (!app) await admin.from('apply_kits').delete().eq('user_id', userId).eq('job_id', jobId);
      }
    },
    async saveApplied(userId, matchId) {
      await saveTo(userId, matchId, 'applied');
    },
    async saveSaved(userId, matchId) {
      await saveTo(userId, matchId, 'saved');
    },
    async topMatches(profile) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await admin
        .from('job_matches')
        .select('id, score, jobs!inner(title, description_text, seniority, status, is_job, posted_at, first_seen_at, companies(name), job_postings(source_id, url, seen_at))')
        .eq('user_id', profile.id)
        .eq('state', 'new')
        .gte('score', profile.minScore)
        .gte('created_at', since)
        .eq('jobs.status', 'active')
        .not('jobs.is_job', 'is', false)
        .or(`posted_at.gte.${since},and(posted_at.is.null,first_seen_at.gte.${since})`, { referencedTable: 'jobs' })
        .order('score', { ascending: false })
        .limit(5);
      if (error) fail('top', error);
      return (data ?? []).map((m) => {
        const job = m.jobs;
        const posting = [...(job.job_postings ?? [])].sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1))[0];
        const facts = { title: job.title, company: job.companies?.name ?? null, descriptionText: job.description_text };
        return {
          matchId: m.id,
          title: job.title,
          company: job.companies?.name ?? null,
          score: m.score,
          salary: null,
          location: null,
          remote: null,
          why: null,
          source: posting ? (sourceInfo(posting.source_id)?.name ?? posting.source_id) : null,
          jobUrl: posting?.url ?? null,
          labels: alertLabels({ domains: detectDomains(facts), perks: detectPerks(facts), seniority: job.seniority }, profile.locale),
        };
      });
    },
    async goal(userId) {
      const [{ data: me, error: pErr }, { data: apps, error: aErr }] = await Promise.all([
        admin.from('profiles').select('timezone, ui_prefs').eq('id', userId).single(),
        admin.from('applications').select('applied_at').eq('user_id', userId).gte('applied_at', new Date(Date.now() - 15 * 86_400_000).toISOString()),
      ]);
      if (pErr) fail('goal', pErr);
      if (aErr) fail('goal', aErr);
      const tz = me?.timezone || 'Europe/Kyiv';
      const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      const today = day(new Date());
      const dates = (apps ?? []).flatMap((a) => (a.applied_at ? [day(new Date(a.applied_at))] : []));
      const goal = parseUiPrefs(me?.ui_prefs).genie?.goal ?? 5;
      return { done: dates.filter((d) => d === today).length, goal, streak: streaks(dates.filter((d) => d !== today), today, goal).streak };
    },
    async setPause(userId, until) {
      const { error } = await admin.from('profiles').update({ telegram_paused_until: until }).eq('id', userId);
      if (error) fail('pause', error);
    },
  };

  async function saveTo(userId: string, matchId: string, key: 'applied' | 'saved'): Promise<void> {
    {
      // Top of the user's column — the same rank the web Save / Applied actions use.
      const { data: column, error: cErr } = await admin.from('board_columns').select('id').eq('user_id', userId).eq('key', key).maybeSingle();
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
        p_column_key: key,
        p_rank: rankAtTop(first?.rank ?? null),
      });
      if (error) fail('save', error);
    }
  }
}
