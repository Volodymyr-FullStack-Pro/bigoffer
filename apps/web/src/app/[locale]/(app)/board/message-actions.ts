'use server';

import type { Json } from '@jp/db';
import { classifyReply, MESSAGE_FORMATS, type MessageFormat, recruiterMessage, type ReplyClassification } from '@jp/ai';
import { meetingLinkIn } from '@jp/core';
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
  opts: { format: MessageFormat; kind: 'intro' | 'follow_up' | 'reply'; lang: 'en' | 'uk' | 'ru' | 'auto'; tone: 'default' | 'shorter' | 'formal'; note?: string },
): Promise<
  | { ok: true; subject: string | null; body: string; channel: ReplyChannel | null }
  | { ok: false; error: 'ai_unavailable' | 'ai_limit' | 'no_cv' | 'not_found' | 'nothing_to_answer' | 'failed' }
> {
  const userId = await getUserId();
  if (!userId || !UUID.test(applicationId) || !MESSAGE_FORMATS.includes(opts.format) || !['intro', 'follow_up', 'reply'].includes(opts.kind) || !['en', 'uk', 'ru', 'auto'].includes(opts.lang) || !['default', 'shorter', 'formal'].includes(opts.tone)) {
    return { ok: false, error: 'not_found' };
  }
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const [{ data: app }, cv, { data: history }, { data: me }] = await Promise.all([
    supabase.from('applications').select('title, company, contact, jobs(description_text)').eq('id', applicationId).maybeSingle(),
    loadPrimaryCv(supabase),
    supabase.from('application_messages').select('direction, channel, author, body').eq('application_id', applicationId).order('sent_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ]);
  if (!app) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  const thread = (history ?? []).reverse().map((m) => ({ direction: m.direction as 'in' | 'out', author: m.author, body: m.body, channel: m.channel }));
  const lastIn = thread.filter((m) => m.direction === 'in').at(-1);
  if (opts.kind === 'reply' && !lastIn) return { ok: false, error: 'nothing_to_answer' };
  const contact = (app.contact ?? {}) as { name?: unknown };
  const channel = lastIn && REPLY_CHANNELS.includes(lastIn.channel as ReplyChannel) ? (lastIn.channel as ReplyChannel) : null;
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  try {
    const res = await recruiterMessage(getLlm(), {
      format: opts.format,
      kind: opts.kind,
      job: { title: app.title, company: app.company, description: app.jobs?.description_text ?? null },
      cv: cv.parsed,
      recruiterName: (opts.kind === 'reply' ? lastIn?.author : null) || (typeof contact.name === 'string' ? contact.name : null),
      candidateName: me?.full_name?.trim() || cv.parsed.fullName?.trim() || null,
      lang: opts.lang,
      tone: opts.tone,
      previous: thread.filter((m) => m.direction === 'out').map((m) => m.body).slice(-5),
      thread: opts.kind === 'reply' ? thread : undefined,
      channel: opts.kind === 'reply' ? channel : null,
      note: typeof opts.note === 'string' ? opts.note.slice(0, 500) : null,
    });
    return { ok: true, ...res, channel: opts.kind === 'reply' ? channel : null };
  } catch (err) {
    console.error('generateRecruiterMessage failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
}

export async function logSentMessage(applicationId: string, channel: ReplyChannel, body: string, link?: string | null): Promise<boolean> {
  const userId = await getUserId();
  const text = body.trim().slice(0, 10_000);
  if (!userId || !UUID.test(applicationId) || !REPLY_CHANNELS.includes(channel) || !text) return false;
  const supabase = await createClient();
  const { data, error: uErr } = await supabase.from('applications').update({ last_activity_at: new Date().toISOString() }).eq('id', applicationId).select('id');
  if (uErr || (data?.length ?? 0) === 0) return false;
  const url = safeLink(link);
  const { error } = await supabase.from('application_messages').insert({ application_id: applicationId, user_id: userId, direction: 'out', channel, body: text, ...(url ? { ai_extracted: { link: url } } : {}) });
  if (error) return false;
  const { error: eErr } = await supabase.from('application_events').insert({ application_id: applicationId, user_id: userId, type: 'message', payload: { direction: 'out', channel } });
  if (eErr) console.error('logSentMessage event failed', eErr.name ?? 'unknown');
  revalidatePath('/[locale]/board', 'page');
  return true;
}

export async function listMessages(applicationId: string) {
  if (!(await getUserId()) || !UUID.test(applicationId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('application_messages').select('id, direction, channel, author, body, sent_at, ai_classification, ai_extracted').eq('application_id', applicationId).order('sent_at', { ascending: false }).limit(50);
  return (data ?? []).map((m) => {
    const extracted = (m.ai_extracted ?? {}) as { summary?: unknown; link?: unknown };
    return {
      id: m.id,
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
): Promise<{ firstResponseAt: string | null; lastActivityAt: string | null; nextActionAt: string | null; contactName: string | null; meetingUrl: string | null } | null> {
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
  const contact = (app.contact ?? {}) as { name?: unknown; url?: unknown; meet?: unknown };
  // The person who answered becomes the card's contact, unless one is set already.
  const knownName = typeof contact.name === 'string' && contact.name ? contact.name : null;
  // A Meet/Zoom link in the invite becomes the card's meeting link; a newer invite replaces an older one.
  const meet = meetingLinkIn(text) ?? (typeof contact.meet === 'string' ? contact.meet : null);
  const contactChanged = (!knownName && author) || meet !== (contact.meet ?? null);
  const next = {
    firstResponseAt: real ? (app.first_response_at ?? now) : app.first_response_at,
    lastActivityAt: real ? now : app.last_activity_at,
    nextActionAt: interviewAt ?? app.next_action_at,
    contactName: knownName ?? author,
    meetingUrl: meet,
  };
  const { data, error: uErr } = await supabase
    .from('applications')
    .update({
      reply_kind: reply.kind,
      first_response_at: next.firstResponseAt,
      last_activity_at: next.lastActivityAt,
      next_action_at: next.nextActionAt,
      ...(contactChanged ? { contact: { ...(contact as Record<string, Json>), ...(knownName ?? author ? { name: knownName ?? author } : {}), ...(meet ? { meet } : {}) } } : {}),
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

/**
 * Removes one message from the conversation (pasted by mistake or in the wrong order). The card's reply tag follows
 * the latest remaining reply from the company.
 */
export async function deleteMessage(applicationId: string, messageId: string): Promise<{ replyKind: ReplyKind | null } | null> {
  if (!(await getUserId()) || !UUID.test(applicationId) || !UUID.test(messageId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('application_messages').delete().eq('id', messageId).eq('application_id', applicationId).select('id');
  if (error || (data?.length ?? 0) === 0) return null;
  const { data: latest } = await supabase
    .from('application_messages')
    .select('ai_classification')
    .eq('application_id', applicationId)
    .eq('direction', 'in')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const replyKind = isReplyKind(latest?.ai_classification) ? latest.ai_classification : null;
  await supabase.from('applications').update({ reply_kind: replyKind }).eq('id', applicationId);
  revalidatePath('/[locale]/board', 'page');
  return { replyKind };
}

/**
 * Changes what a logged company reply was (e.g. a plain answer that was really an auto-reply). The card follows:
 * its tag is the latest reply's kind, and "got a response" counts only replies that are not automatic.
 */
export async function setMessageKind(
  applicationId: string,
  messageId: string,
  kind: ReplyKind,
): Promise<{ replyKind: ReplyKind | null; firstResponseAt: string | null } | null> {
  if (!(await getUserId()) || !UUID.test(applicationId) || !UUID.test(messageId) || !isReplyKind(kind)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('application_messages')
    .update({ ai_classification: kind })
    .eq('id', messageId)
    .eq('application_id', applicationId)
    .eq('direction', 'in')
    .select('id');
  if (error || (data?.length ?? 0) === 0) return null;
  const { data: replies } = await supabase
    .from('application_messages')
    .select('ai_classification, sent_at')
    .eq('application_id', applicationId)
    .eq('direction', 'in')
    .order('sent_at', { ascending: true });
  const list = replies ?? [];
  const latest = list.at(-1)?.ai_classification;
  const replyKind = isReplyKind(latest) ? latest : null;
  const firstResponseAt = list.find((r) => r.ai_classification !== 'auto_reply')?.sent_at ?? null;
  await supabase.from('applications').update({ reply_kind: replyKind, first_response_at: firstResponseAt }).eq('id', applicationId);
  revalidatePath('/[locale]/board', 'page');
  return { replyKind, firstResponseAt };
}

/** Corrects a saved message: channel, sender, text, conversation link. Direction and time stay as logged. */
export async function updateMessage(
  applicationId: string,
  messageId: string,
  patch: { channel: ReplyChannel; author: string | null; body: string; link: string | null },
): Promise<boolean> {
  const text = patch.body.trim().slice(0, 10_000);
  if (!(await getUserId()) || !UUID.test(applicationId) || !UUID.test(messageId) || !REPLY_CHANNELS.includes(patch.channel) || !text) return false;
  const supabase = await createClient();
  const { data: current } = await supabase.from('application_messages').select('ai_extracted').eq('id', messageId).eq('application_id', applicationId).maybeSingle();
  if (!current) return false;
  const extracted = { ...((current.ai_extracted ?? {}) as Record<string, unknown>) };
  const link = safeLink(patch.link);
  if (link) extracted.link = link;
  else delete extracted.link;
  const { data, error } = await supabase
    .from('application_messages')
    .update({ channel: patch.channel, author: patch.author?.trim().slice(0, 120) || null, body: text, ai_extracted: extracted as Json })
    .eq('id', messageId)
    .eq('application_id', applicationId)
    .select('id');
  revalidatePath('/[locale]/board', 'page');
  return !error && (data?.length ?? 0) > 0;
}

/** Changes the reply kind shown on the card without logging a message (e.g. the AI guessed wrong). */
export async function setReplyKind(applicationId: string, kind: ReplyKind | null): Promise<boolean> {
  if (!(await getUserId()) || !UUID.test(applicationId) || (kind !== null && !isReplyKind(kind))) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('applications').update({ reply_kind: kind }).eq('id', applicationId).select('id');
  revalidatePath('/[locale]/board', 'page');
  return !error && (data?.length ?? 0) > 0;
}
