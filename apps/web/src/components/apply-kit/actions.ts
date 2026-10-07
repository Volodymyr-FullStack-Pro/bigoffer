'use server';

import { answerForm, type ApplyKit, generateApplyKit, type KitJob } from '@jp/ai';
import { matchBankKey, rankAtTop, splitQuestions } from '@jp/core';
import type { Json, TablesInsert } from '@jp/db';
import { revalidatePath } from 'next/cache';
import { getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { cvSignedUrl, loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { chooseTemplate } from './template';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type KitError = 'ai_unavailable' | 'no_cv' | 'not_found' | 'failed';
export type FormAnswer = { question: string; answer: string; fromBank: boolean };
export type StoredKit = ApplyKit & { formAnswers: FormAnswer[] };
export type KitData = { kit: StoredKit | null; formAnswers: FormAnswer[]; aiAvailable: boolean; hasCv: boolean; contacts: Record<string, string>; cvLink: string | null; jobUrl: string | null };

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

/** Private-AI spend and kit writes are limited to jobs the user has a match or a board card for. */
async function hasJobAccess(supabase: Supabase, jobId: string): Promise<boolean> {
  const [{ data: match }, { data: app }] = await Promise.all([
    supabase.from('job_matches').select('id').eq('job_id', jobId).limit(1).maybeSingle(),
    supabase.from('applications').select('id').eq('job_id', jobId).limit(1).maybeSingle(),
  ]);
  return Boolean(match || app);
}

const logFail = (what: string, err: unknown) => console.error(`${what} failed`, err instanceof Error ? err.name : 'unknown');

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
  const stored = kit ? toStored(kit) : null;
  return {
    // A row holding only form answers (no letter generated yet) is not a kit.
    kit: stored && kit?.cover_letter ? stored : null,
    formAnswers: stored?.formAnswers ?? [],
    aiAvailable: privateAiAvailable(),
    hasCv: Boolean(cv?.parsed),
    contacts,
    cvLink: cv ? await cvSignedUrl(supabase, cv.path) : null,
    jobUrl: job?.url ?? null,
  };
}

type KitFields = Omit<TablesInsert<'apply_kits'>, 'user_id' | 'job_id'>;

/** Insert-or-update by (user, job); column grants forbid ON CONFLICT upserts. A concurrent insert (23505) falls back to update. */
async function storeKit(supabase: Supabase, userId: string, jobId: string, fields: KitFields): Promise<boolean> {
  const update = async () => {
    const { data, error } = await supabase.from('apply_kits').update(fields).eq('job_id', jobId).select('id');
    return !error && (data?.length ?? 0) > 0;
  };
  const { data: existing } = await supabase.from('apply_kits').select('id').eq('job_id', jobId).maybeSingle();
  if (existing) return update();
  const { error } = await supabase.from('apply_kits').insert({ user_id: userId, job_id: jobId, ...fields });
  if (!error) return true;
  return error.code === '23505' ? update() : false;
}

export async function generateKit(jobId: string, opts: { lang: 'auto' | 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal' }): Promise<{ ok: true; kit: StoredKit } | { ok: false; error: KitError }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !['auto', 'en', 'uk', 'ru'].includes(opts.lang) || !['default', 'shorter', 'formal'].includes(opts.tone)) return { ok: false, error: 'not_found' };
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  if (!(await hasJobAccess(supabase, jobId))) return { ok: false, error: 'not_found' };
  const [job, cv] = await Promise.all([loadJob(supabase, jobId), loadPrimaryCv(supabase)]);
  if (!job) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  const [{ data: templates }, { data: profiles }, { data: profileRow }] = await Promise.all([
    supabase.from('letter_templates').select('locale, body'),
    supabase.from('search_profiles').select('salary_min_usd').not('salary_min_usd', 'is', null).limit(1),
    supabase.from('profiles').select('locale').eq('id', userId).single(),
  ]);
  const template = chooseTemplate(templates, opts.lang, profileRow?.locale);
  try {
    const kit = await generateApplyKit(getLlm(), { job, cv: cv.parsed, template, lang: opts.lang, tone: opts.tone, salaryMinUsd: profiles?.[0]?.salary_min_usd ?? null });
    const { data: existing } = await supabase.from('apply_kits').select('form_answers').eq('job_id', jobId).maybeSingle();
    const stored = await storeKit(supabase, userId, jobId, {
      lang: kit.lang,
      requirements: kit.requirements as unknown as NonNullable<Json>,
      red_flags: kit.redFlags,
      cover_letter: kit.coverLetter,
      short_message: kit.shortMessage,
      salary_hint: kit.salaryHint,
      generated_at: new Date().toISOString(),
    });
    if (!stored) return { ok: false, error: 'failed' };
    return { ok: true, kit: { ...kit, formAnswers: Array.isArray(existing?.form_answers) ? (existing.form_answers as FormAnswer[]) : [] } };
  } catch (err) {
    logFail('generateKit', err);
    return { ok: false, error: 'failed' };
  }
}

/** Persists the user's edit of the letter (called when the letter is copied). */
export async function saveKitLetter(jobId: string, letter: string): Promise<boolean> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || letter.length > 6000 || !letter.trim()) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('apply_kits').update({ cover_letter: letter }).eq('job_id', jobId).select('id');
  return !error && (data?.length ?? 0) > 0;
}

export async function answerFormQuestions(jobId: string, formText: string): Promise<{ ok: true; answers: FormAnswer[] } | { ok: false; error: KitError }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || typeof formText !== 'string') return { ok: false, error: 'not_found' };
  const questions = splitQuestions(formText.slice(0, 10_000)).slice(0, 20);
  if (questions.length === 0) return { ok: false, error: 'not_found' };
  const supabase = await createClient();
  if (!(await hasJobAccess(supabase, jobId))) return { ok: false, error: 'not_found' };
  const [{ data: bank }, { data: kit }, { data: profile }] = await Promise.all([
    supabase.from('answer_bank').select('key, answer'),
    supabase.from('apply_kits').select('id, lang').eq('job_id', jobId).maybeSingle(),
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
      logFail('answerForm', err);
      return { ok: false, error: 'failed' };
    }
  }
  let stored: boolean;
  if (kit) {
    const { data, error } = await supabase.from('apply_kits').update({ form_answers: answers }).eq('job_id', jobId).select('id');
    stored = !error && (data?.length ?? 0) > 0;
  } else {
    stored = await storeKit(supabase, userId, jobId, { lang, requirements: [], red_flags: [], cover_letter: '', short_message: '', salary_hint: null, form_answers: answers as unknown as NonNullable<Json> });
  }
  return stored ? { ok: true, answers } : { ok: false, error: 'failed' };
}

/** "Did you apply?" → yes: the job's card goes to Applied (created from the match if needed) with the letter the user actually used. */
export async function markAppliedFromKit(jobId: string, letterKind: 'full' | 'short' | 'none', letterText: string | null): Promise<{ ok: true; columnId: string; rank: string } | { ok: false }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !['full', 'short', 'none'].includes(letterKind)) return { ok: false };
  if (letterText !== null && (typeof letterText !== 'string' || letterText.length > 6000)) return { ok: false };
  const supabase = await createClient();
  const { data: columns } = await supabase.from('board_columns').select('id, key, position, kind');
  const applied = columns?.find((c) => c.key === 'applied');
  if (!applied) return { ok: false };
  const { data: first } = await supabase.from('applications').select('rank').eq('column_id', applied.id).order('rank').limit(1).maybeSingle();
  const rank = rankAtTop(first?.rank ?? null);
  const { data: existing } = await supabase.from('applications').select('id, column_id').eq('job_id', jobId).maybeSingle();
  let appId: string;
  if (!existing) {
    const { data: match } = await supabase.from('job_matches').select('id').eq('job_id', jobId).maybeSingle();
    if (!match) return { ok: false };
    const { data, error } = await supabase.rpc('save_match_to_board', { p_match_id: match.id, p_column_key: 'applied', p_rank: rank });
    if (error || !data?.[0]) return { ok: false };
    appId = data[0].application_id;
  } else {
    appId = existing.id;
    const current = columns?.find((c) => c.id === existing.column_id);
    // Only cards sitting before "Applied" move there; later stages stay where they are.
    if (current && current.id !== applied.id && current.kind === 'active' && current.position < applied.position) {
      const { error } = await supabase.rpc('move_application', { p_id: appId, p_column_id: applied.id, p_rank: rank });
      if (error) return { ok: false };
    }
  }
  const { data: updated } = await supabase
    .from('applications')
    .update({ letter_kind: letterKind, letter_used: letterKind === 'none' ? null : (letterText?.trim() || null) })
    .eq('id', appId)
    .select('id, column_id, rank');
  revalidatePath('/[locale]/board', 'page');
  revalidatePath('/[locale]/today', 'page');
  const row = updated?.[0];
  return row ? { ok: true, columnId: row.column_id, rank: row.rank } : { ok: false };
}
