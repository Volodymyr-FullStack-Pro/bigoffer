'use server';

import { classifyReply, MESSAGE_FORMATS, type MessageFormat, recruiterMessage, type ReplyClassification } from '@jp/ai';
import { revalidatePath } from 'next/cache';
import { getTimeZone } from 'next-intl/server';
import { consumePrivateAi, getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { isReplyKind, type ReplyKind } from './reply-kinds';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateRecruiterMessage(
  applicationId: string,
  opts: { format: MessageFormat; kind: 'intro' | 'follow_up'; lang: 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal' },
): Promise<{ ok: true; subject: string | null; body: string } | { ok: false; error: 'ai_unavailable' | 'ai_limit' | 'no_cv' | 'not_found' | 'failed' }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(applicationId) || !MESSAGE_FORMATS.includes(opts.format) || !['intro', 'follow_up'].includes(opts.kind) || !['en', 'uk', 'ru'].includes(opts.lang) || !['default', 'shorter', 'formal'].includes(opts.tone)) {
    return { ok: false, error: 'not_found' };
  }
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const [{ data: app }, cv, { data: previous }, { data: me }] = await Promise.all([
    supabase.from('applications').select('title, company, contact, jobs(description_text)').eq('id', applicationId).maybeSingle(),
    loadPrimaryCv(supabase),
    supabase.from('application_messages').select('body').eq('application_id', applicationId).eq('direction', 'out').order('sent_at', { ascending: false }).limit(5),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ]);
  if (!app) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  const contact = (app.contact ?? {}) as { name?: unknown };
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  try {
    const res = await recruiterMessage(getLlm(), {
      format: opts.format,
      kind: opts.kind,
      job: { title: app.title, company: app.company, description: app.jobs?.description_text ?? null },
      cv: cv.parsed,
      recruiterName: typeof contact.name === 'string' ? contact.name : null,
      candidateName: me?.full_name?.trim() || cv.parsed.fullName?.trim() || null,
      lang: opts.lang,
      tone: opts.tone,
      previous: (previous ?? []).map((p) => p.body).reverse(),
    });
    return { ok: true, ...res };
  } catch (err) {
    console.error('generateRecruiterMessage failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
}

export async function logSentMessage(applicationId: string, channel: 'email' | 'linkedin' | 'telegram' | 'other', body: string): Promise<boolean> {
  const userId = await getUserId();
  const text = body.trim().slice(0, 10_000);
  if (!userId || !UUID.test(applicationId) || !['email', 'linkedin', 'telegram', 'other'].includes(channel) || !text) return false;
  const supabase = await createClient();
  const { data, error: uErr } = await supabase.from('applications').update({ last_activity_at: new Date().toISOString() }).eq('id', applicationId).select('id');
  if (uErr || (data?.length ?? 0) === 0) return false;
  const { error } = await supabase.from('application_messages').insert({ application_id: applicationId, user_id: userId, direction: 'out', channel, body: text });
  if (error) return false;
  const { error: eErr } = await supabase.from('application_events').insert({ application_id: applicationId, user_id: userId, type: 'message', payload: { direction: 'out', channel } });
  if (eErr) console.error('logSentMessage event failed', eErr.name ?? 'unknown');
  revalidatePath('/[locale]/board', 'page');
  return true;
}

export async function listMessages(applicationId: string) {
  if (!(await getUserId()) || !UUID.test(applicationId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('application_messages').select('direction, channel, author, body, sent_at, ai_classification, ai_extracted').eq('application_id', applicationId).order('sent_at', { ascending: false }).limit(50);
  return (data ?? []).map((m) => {
    const extracted = (m.ai_extracted ?? {}) as { summary?: unknown; link?: unknown };
    return {
      direction: m.direction as 'in' | 'out',
      channel: m.channel,
      body: m.body,
      sentAt: m.sent_at,
      kind: isReplyKind(m.ai_classification) ? m.ai_classification : null,
      summary: typeof extracted.summary === 'string' ? extracted.summary : null,
      link: safeLink(extracted.link),
      author: m.author,
    };
  });
}

/** An http(s) link to the conversation (Djinni inbox, mail, LinkedIn), or null. */
function safeLink(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const REPLY_CHANNELS = ['djinni', 'dou', 'robotaua', 'email', 'linkedin', 'telegram', 'call', 'other'] as const;
export type ReplyChannel = (typeof REPLY_CHANNELS)[number];

/** Asks the writing model what a pasted recruiter reply is. Spends one private AI request. */
export async function suggestReplyKind(
  applicationId: string,
  text: string,
  lang: 'en' | 'uk' | 'ru',
): Promise<({ ok: true } & ReplyClassification) | { ok: false; error: 'ai_unavailable' | 'ai_limit' | 'not_found' | 'failed' }> {
  const body = text.trim();
  if (!(await getUserId()) || !UUID.test(applicationId) || !body || !['en', 'uk', 'ru'].includes(lang)) return { ok: false, error: 'not_found' };
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const { data: app } = await supabase.from('applications').select('title, company').eq('id', applicationId).maybeSingle();
  if (!app) return { ok: false, error: 'not_found' };
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  try {
    const res = await classifyReply(getLlm(), { text: body, job: app, lang, timeZone: await getTimeZone(), now: new Date() });
    return { ok: true, ...res };
  } catch (err) {
    console.error('suggestReplyKind failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
}

/**
 * Saves a reply the candidate received. An automatic acknowledgement only tags the card;
 * a real answer also counts as the first response and resets the follow-up clock.
 */
export async function logReply(
  applicationId: string,
  reply: { channel: ReplyChannel; body: string; kind: ReplyKind; summary?: string | null; interviewAt?: string | null; author?: string | null; link?: string | null },
): Promise<{ firstResponseAt: string | null; lastActivityAt: string | null; nextActionAt: string | null; contactName: string | null } | null> {
  const userId = await getUserId();
  const text = reply.body.trim().slice(0, 10_000);
  const interviewAt = reply.interviewAt && !Number.isNaN(Date.parse(reply.interviewAt)) ? new Date(reply.interviewAt).toISOString() : null;
  if (!userId || !UUID.test(applicationId) || !REPLY_CHANNELS.includes(reply.channel) || !isReplyKind(reply.kind) || !text) return null;
  const supabase = await createClient();
  const { data: app } = await supabase.from('applications').select('first_response_at, last_activity_at, next_action_at, contact').eq('id', applicationId).maybeSingle();
  if (!app) return null;
  const now = new Date().toISOString();
  const real = reply.kind !== 'auto_reply';
  const author = reply.author?.trim().slice(0, 120) || null;
  const link = safeLink(reply.link);
  const contact = (app.contact ?? {}) as { name?: unknown; url?: unknown };
  // The person who answered becomes the card's contact, unless one is set already.
  const knownName = typeof contact.name === 'string' && contact.name ? contact.name : null;
  const next = {
    firstResponseAt: real ? (app.first_response_at ?? now) : app.first_response_at,
    lastActivityAt: real ? now : app.last_activity_at,
    nextActionAt: interviewAt ?? app.next_action_at,
    contactName: knownName ?? author,
  };
  const { data, error: uErr } = await supabase
    .from('applications')
    .update({
      reply_kind: reply.kind,
      first_response_at: next.firstResponseAt,
      last_activity_at: next.lastActivityAt,
      next_action_at: next.nextActionAt,
      ...(!knownName && author ? { contact: { ...(typeof contact.url === 'string' ? { url: contact.url } : {}), name: author } } : {}),
    })
    .eq('id', applicationId)
    .select('id');
  if (uErr || (data?.length ?? 0) === 0) return null;
  const summary = reply.summary?.trim().slice(0, 200) || null;
  const { error } = await supabase.from('application_messages').insert({
    application_id: applicationId,
    user_id: userId,
    direction: 'in',
    channel: reply.channel,
    author,
    body: text,
    ai_classification: reply.kind,
    ai_extracted: { ...(summary ? { summary } : {}), ...(interviewAt ? { interviewAt } : {}), ...(link ? { link } : {}) },
  });
  if (error) return null;
  const { error: eErr } = await supabase.from('application_events').insert({ application_id: applicationId, user_id: userId, type: 'message', payload: { direction: 'in', channel: reply.channel, kind: reply.kind } });
  if (eErr) console.error('logReply event failed', eErr.name ?? 'unknown');
  revalidatePath('/[locale]/board', 'page');
  return next;
}

/** Changes the reply kind shown on the card without logging a message (e.g. the AI guessed wrong). */
export async function setReplyKind(applicationId: string, kind: ReplyKind | null): Promise<boolean> {
  if (!(await getUserId()) || !UUID.test(applicationId) || (kind !== null && !isReplyKind(kind))) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('applications').update({ reply_kind: kind }).eq('id', applicationId).select('id');
  revalidatePath('/[locale]/board', 'page');
  return !error && (data?.length ?? 0) > 0;
}
