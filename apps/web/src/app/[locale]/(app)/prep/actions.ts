'use server';

import { type PrepLesson, type PrepPitch, type PrepPlan, prepLesson, prepPitch, prepPlan } from '@jp/ai';
import type { Json } from '@jp/db';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { consumePrivateAi, getLlm, privateAiAvailable, publicAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { asPlan } from './prep-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Err = 'ai_unavailable' | 'ai_limit' | 'no_cv' | 'not_found' | 'failed';

async function lang(): Promise<'uk' | 'ru' | 'en'> {
  const l = await getLocale();
  return l === 'uk' || l === 'ru' ? l : 'en';
}

/** The prep for a card: the existing one, or a new plan built from the job posting (one AI request). */
export async function startPrep(applicationId: string): Promise<{ ok: true; id: string } | { ok: false; error: Err }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(applicationId)) return { ok: false, error: 'not_found' };
  const supabase = await createClient();
  const { data: existing } = await supabase.from('interview_preps').select('id').eq('application_id', applicationId).maybeSingle();
  if (existing) return { ok: true, id: existing.id };
  const { data: app } = await supabase.from('applications').select('title, company, notes, jobs(description_text)').eq('id', applicationId).maybeSingle();
  if (!app) return { ok: false, error: 'not_found' };
  if (!publicAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  const l = await lang();
  let plan: PrepPlan;
  try {
    // A card added by hand has no posting: the title and company still give a useful plan.
    plan = await prepPlan(getLlm(), { job: { title: app.title, company: app.company ?? '', description: app.jobs?.description_text ?? null }, lang: l });
  } catch (err) {
    console.error('startPrep failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
  const { data, error } = await supabase
    .from('interview_preps')
    .insert({ user_id: userId, application_id: applicationId, lang: l, plan: plan as unknown as NonNullable<Json> })
    .select('id')
    .single();
  if (error) {
    // Two clicks at once: the other request made it.
    const { data: again } = await supabase.from('interview_preps').select('id').eq('application_id', applicationId).maybeSingle();
    return again ? { ok: true, id: again.id } : { ok: false, error: 'failed' };
  }
  revalidatePath('/[locale]/prep', 'page');
  return { ok: true, id: data.id };
}

/** The lesson on one topic of the plan, written once and kept. */
export async function getLesson(prepId: string, key: string): Promise<{ ok: true; lesson: PrepLesson } | { ok: false; error: Err }> {
  if (!(await getUserId()) || !UUID.test(prepId) || key.length > 80) return { ok: false, error: 'not_found' };
  const supabase = await createClient();
  const { data: prep } = await supabase.from('interview_preps').select('lang, plan, lessons').eq('id', prepId).maybeSingle();
  const plan = prep ? asPlan(prep.plan) : null;
  const topic = plan?.topics.find((t) => t.key === key);
  if (!prep || !plan || !topic) return { ok: false, error: 'not_found' };
  const lessons = (prep.lessons ?? {}) as Record<string, PrepLesson>;
  if (lessons[key]) return { ok: true, lesson: lessons[key] };
  if (!publicAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  let lesson: PrepLesson;
  try {
    lesson = await prepLesson(getLlm(), { topic: topic.title, why: topic.why, role: plan.role, lang: prep.lang });
  } catch (err) {
    console.error('getLesson failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
  // Re-read before writing: another topic may have been written meanwhile.
  const { data: fresh } = await supabase.from('interview_preps').select('lessons').eq('id', prepId).maybeSingle();
  const merged = { ...((fresh?.lessons ?? {}) as Record<string, unknown>), [key]: lesson };
  await supabase.from('interview_preps').update({ lessons: merged as unknown as NonNullable<Json> }).eq('id', prepId);
  return { ok: true, lesson };
}

/** "How to tell them about me": a self-intro and an answer per expectation, from the CV (private AI). */
export async function getPitch(prepId: string, again = false): Promise<{ ok: true; pitch: PrepPitch } | { ok: false; error: Err }> {
  if (!(await getUserId()) || !UUID.test(prepId)) return { ok: false, error: 'not_found' };
  const supabase = await createClient();
  const { data: prep } = await supabase
    .from('interview_preps')
    .select('lang, plan, pitch, applications(title, company, jobs(description_text))')
    .eq('id', prepId)
    .maybeSingle();
  const plan = prep ? asPlan(prep.plan) : null;
  if (!prep || !plan || !prep.applications) return { ok: false, error: 'not_found' };
  if (prep.pitch && !again) return { ok: true, pitch: prep.pitch as unknown as PrepPitch };
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const cv = await loadPrimaryCv(supabase);
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  const app = prep.applications;
  try {
    const pitch = await prepPitch(getLlm(), {
      job: { title: app.title, company: app.company ?? '', description: app.jobs?.description_text ?? null },
      cv: cv.parsed,
      expectations: plan.expectations,
      lang: prep.lang,
    });
    await supabase.from('interview_preps').update({ pitch: pitch as unknown as Json }).eq('id', prepId);
    return { ok: true, pitch };
  } catch (err) {
    console.error('getPitch failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
}

export async function setTopicDone(prepId: string, key: string, done: boolean): Promise<string[] | null> {
  if (!(await getUserId()) || !UUID.test(prepId) || key.length > 80) return null;
  const supabase = await createClient();
  const { data: prep } = await supabase.from('interview_preps').select('done').eq('id', prepId).maybeSingle();
  if (!prep) return null;
  const next = done ? [...new Set([...prep.done, key])] : prep.done.filter((k) => k !== key);
  const { error } = await supabase.from('interview_preps').update({ done: next }).eq('id', prepId);
  return error ? null : next;
}

export async function deletePrep(prepId: string): Promise<boolean> {
  if (!(await getUserId()) || !UUID.test(prepId)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('interview_preps').delete().eq('id', prepId).select('id');
  revalidatePath('/[locale]/prep', 'page');
  return !error && (data?.length ?? 0) > 0;
}
