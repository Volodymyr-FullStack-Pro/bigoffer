'use server';

import { MESSAGE_FORMATS, type MessageFormat, recruiterMessage } from '@jp/ai';
import { revalidatePath } from 'next/cache';
import { consumePrivateAi, getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';

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
  const { data } = await supabase.from('application_messages').select('direction, channel, body, sent_at').eq('application_id', applicationId).order('sent_at', { ascending: false }).limit(50);
  return (data ?? []).map((m) => ({ direction: m.direction as 'in' | 'out', channel: m.channel, body: m.body, sentAt: m.sent_at }));
}
