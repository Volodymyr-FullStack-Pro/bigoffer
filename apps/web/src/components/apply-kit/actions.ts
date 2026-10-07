'use server';

import { answerForm, type ApplyKit, generateApplyKit, type KitJob } from '@jp/ai';
import { matchBankKey, rankAtTop, splitQuestions } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { cvSignedUrl, loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type KitError = 'ai_unavailable' | 'no_cv' | 'not_found' | 'failed';
export type FormAnswer = { question: string; answer: string; fromBank: boolean };
export type StoredKit = ApplyKit & { formAnswers: FormAnswer[] };
export type KitData = { kit: StoredKit | null; aiAvailable: boolean; hasCv: boolean; contacts: Record<string, string>; cvLink: string | null; jobUrl: string | null };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadJob(supabase: Supabase, jobId: string): Promise<(KitJob & { url: string | null; salaryMinUsd: number | null }) | null> {
  const { data } = await supabase
    .from('jobs')
    .select('title, description_text, salary_raw, salary_min_usd, salary_max_usd, companies(name), job_postings(url, seen_at)')
    .eq('id', jobId)
    .maybeSingle();
  if (!data) return null;
  const salary = data.salary_raw ?? (data.salary_min_usd || data.salary_max_usd ? `$${data.salary_min_usd ?? '?'}–${data.salary_max_usd ?? '?'} per month` : null);
  const url = [...data.job_postings].sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1)).find((p) => /^https?:\/\//i.test(p.url))?.url ?? null;
  return { title: data.title, company: data.companies?.name ?? '', description: data.description_text, salary, url, salaryMinUsd: null };
}

function toStored(row: { lang: string; requirements: unknown; red_flags: string[]; cover_letter: string; short_message: string; salary_hint: string | null; form_answers: unknown }): StoredKit {
  return {
    lang: row.lang,
    requirements: Array.isArray(row.requirements) ? (row.requirements as ApplyKit['requirements']) : [],
    redFlags: row.red_flags,
    coverLetter: row.cover_letter,
    shortMessage: row.short_message,
    salaryHint: row.salary_hint,
    formAnswers: Array.isArray(row.form_answers) ? (row.form_answers as FormAnswer[]) : [],
  };
}

export async function getApplyKitData(jobId: string): Promise<KitData | null> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId)) return null;
  const supabase = await createClient();
  const [{ data: kit }, cv, { data: profile }, job] = await Promise.all([
    supabase.from('apply_kits').select('lang, requirements, red_flags, cover_letter, short_message, salary_hint, form_answers').eq('job_id', jobId).maybeSingle(),
    loadPrimaryCv(supabase),
    supabase.from('profiles').select('contacts').eq('id', userId).single(),
    loadJob(supabase, jobId),
  ]);
  const contacts = Object.fromEntries(Object.entries((profile?.contacts ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
  return {
    kit: kit ? toStored(kit) : null,
    aiAvailable: privateAiAvailable(),
    hasCv: Boolean(cv?.parsed),
    contacts,
    cvLink: cv ? await cvSignedUrl(supabase, cv.path) : null,
    jobUrl: job?.url ?? null,
  };
}

export async function generateKit(jobId: string, opts: { lang: 'auto' | 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal' }): Promise<{ ok: true; kit: StoredKit } | { ok: false; error: KitError }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !['auto', 'en', 'uk', 'ru'].includes(opts.lang) || !['default', 'shorter', 'formal'].includes(opts.tone)) return { ok: false, error: 'not_found' };
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const [job, cv] = await Promise.all([loadJob(supabase, jobId), loadPrimaryCv(supabase)]);
  if (!job) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  const langForTemplate = opts.lang === 'auto' ? null : opts.lang;
  const [{ data: templates }, { data: profiles }] = await Promise.all([
    supabase.from('letter_templates').select('locale, body'),
    supabase.from('search_profiles').select('salary_min_usd').not('salary_min_usd', 'is', null).limit(1),
  ]);
  const template = (langForTemplate ? templates?.find((t) => t.locale === langForTemplate) : templates?.[0])?.body ?? null;
  try {
    const kit = await generateApplyKit(getLlm(), { job, cv: cv.parsed, template, lang: opts.lang, tone: opts.tone, salaryMinUsd: profiles?.[0]?.salary_min_usd ?? null });
    const { data: existing } = await supabase.from('apply_kits').select('form_answers').eq('job_id', jobId).maybeSingle();
    const fields = {
      lang: kit.lang,
      requirements: kit.requirements,
      red_flags: kit.redFlags,
      cover_letter: kit.coverLetter,
      short_message: kit.shortMessage,
      salary_hint: kit.salaryHint,
      generated_at: new Date().toISOString(),
    };
    // Column-level grants allow updating only the content columns, so insert-or-update instead of upsert.
    const { error } = existing
      ? await supabase.from('apply_kits').update(fields).eq('job_id', jobId)
      : await supabase.from('apply_kits').insert({ user_id: userId, job_id: jobId, ...fields });
    if (error) return { ok: false, error: 'failed' };
    return { ok: true, kit: { ...kit, formAnswers: Array.isArray(existing?.form_answers) ? (existing.form_answers as FormAnswer[]) : [] } };
  } catch (err) {
    console.error('generateKit failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'failed' };
  }
}

export async function answerFormQuestions(jobId: string, formText: string): Promise<{ ok: true; answers: FormAnswer[] } | { ok: false; error: KitError }> {
  const userId = await getUserId();
  const questions = splitQuestions(formText.slice(0, 10_000));
  if (!userId || !UUID.test(jobId) || questions.length === 0) return { ok: false, error: 'not_found' };
  const supabase = await createClient();
  const [{ data: bank }, { data: kit }, { data: profile }] = await Promise.all([
    supabase.from('answer_bank').select('key, answer'),
    supabase.from('apply_kits').select('lang').eq('job_id', jobId).maybeSingle(),
    supabase.from('profiles').select('locale').eq('id', userId).single(),
  ]);
  const lang = kit?.lang ?? profile?.locale ?? 'en';
  const fromBank = (q: string): string | null => {
    const key = matchBankKey(q);
    const row = key ? bank?.find((b) => b.key === key) : undefined;
    const answers = (row?.answer ?? {}) as Record<string, string>;
    return row ? (answers[lang] || answers.en || Object.values(answers).find(Boolean) || null) : null;
  };
  const answers: FormAnswer[] = questions.map((q) => {
    const a = fromBank(q);
    return { question: q, answer: a ?? '', fromBank: a !== null };
  });
  const missing = answers.filter((a) => !a.fromBank);
  if (missing.length > 0) {
    if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
    const [job, cv] = await Promise.all([loadJob(supabase, jobId), loadPrimaryCv(supabase)]);
    if (!job) return { ok: false, error: 'not_found' };
    if (!cv?.parsed) return { ok: false, error: 'no_cv' };
    try {
      const generated = await answerForm(getLlm(), { questions: missing.map((m) => m.question), job, cv: cv.parsed, lang });
      missing.forEach((m, i) => { m.answer = generated[i] ?? ''; });
    } catch (err) {
      console.error('answerForm failed', err instanceof Error ? err.message : err);
      return { ok: false, error: 'failed' };
    }
  }
  await supabase.from('apply_kits').update({ form_answers: answers }).eq('job_id', jobId);
  return { ok: true, answers };
}

/** "Did you apply?" → yes: the job's card goes to Applied (created from the match if needed) with the letter used. */
export async function markAppliedFromKit(jobId: string, letterKind: 'full' | 'short' | 'none'): Promise<boolean> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !['full', 'short', 'none'].includes(letterKind)) return false;
  const supabase = await createClient();
  const { data: applied } = await supabase.from('board_columns').select('id').eq('key', 'applied').single();
  if (!applied) return false;
  const { data: first } = await supabase.from('applications').select('rank').eq('column_id', applied.id).order('rank').limit(1).maybeSingle();
  const rank = rankAtTop(first?.rank ?? null);
  let { data: app } = await supabase.from('applications').select('id, column_id').eq('job_id', jobId).maybeSingle();
  if (!app) {
    const { data: match } = await supabase.from('job_matches').select('id').eq('job_id', jobId).maybeSingle();
    if (!match) return false;
    const { data, error } = await supabase.rpc('save_match_to_board', { p_match_id: match.id, p_column_key: 'applied', p_rank: rank });
    if (error || !data?.[0]) return false;
    app = { id: data[0].application_id, column_id: applied.id };
  } else if (app.column_id !== applied.id) {
    const { error } = await supabase.rpc('move_application', { p_id: app.id, p_column_id: applied.id, p_rank: rank });
    if (error) return false;
  }
  const { data: kit } = await supabase.from('apply_kits').select('cover_letter, short_message').eq('job_id', jobId).maybeSingle();
  const letter = letterKind === 'full' ? kit?.cover_letter : letterKind === 'short' ? kit?.short_message : null;
  const { data: updated } = await supabase
    .from('applications')
    .update({ letter_kind: letterKind, letter_used: letter ?? null })
    .eq('id', app.id)
    .select('id');
  revalidatePath('/[locale]/board', 'page');
  return (updated?.length ?? 0) > 0;
}
