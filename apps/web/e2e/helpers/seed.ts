import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeCv } from '@jp/ai';
import { fakeResponder } from '@jp/ai/testing';
import { rankAtEnd } from '@jp/core';
import { createClient } from '@supabase/supabase-js';

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

async function userIdByEmail(email: string): Promise<string> {
  const db = admin();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`user ${email} not found`);
}

export async function seedMatch(
  email: string,
  opts: {
    title?: string;
    score?: number;
    status?: 'active' | 'expired';
    seniority?: 'intern' | 'junior' | 'middle' | 'senior' | 'lead';
    skills?: string[];
    summary?: Record<string, string>;
    explanation?: Record<string, string>;
    matchedSkills?: string[];
    isJob?: boolean | null;
    state?: 'new' | 'seen';
    sourceId?: string;
    url?: string;
    postedAt?: string;
  } = {},
) {
  const db = admin();
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = opts.title ?? `Senior Full Stack Developer ${tag}`;
  const userId = await userIdByEmail(email);
  const { data: company, error: cErr } = await db
    .from('companies')
    .insert({ name: `Acme ${tag}`, normalized_name: `acme ${tag}` })
    .select('id')
    .single();
  if (cErr) throw cErr;
  const { data: job, error: jErr } = await db
    .from('jobs')
    .insert({ fingerprint: `e2e-${tag}`, title, company_id: company.id, remote_type: 'remote', salary_min_usd: 3000, salary_max_usd: 4500, status: opts.status ?? 'active', seniority: opts.seniority ?? null, skills: opts.skills ?? [], summary: opts.summary ?? null, is_job: opts.isJob ?? null, posted_at: opts.postedAt ?? null })
    .select('id')
    .single();
  if (jErr) throw jErr;
  const { error: pErr } = await db.from('job_postings').insert({ job_id: job.id, source_id: opts.sourceId ?? 'dou', external_id: `e2e-${tag}`, url: opts.url ?? `https://jobs.dou.ua/vacancies/${tag}/` });
  if (pErr) throw pErr;
  const { data: match, error: mErr } = await db
    .from('job_matches')
    .insert({ user_id: userId, job_id: job.id, score: opts.score ?? 88, state: opts.state ?? 'new', explanation: opts.explanation ?? null, breakdown: { matchedSkills: opts.matchedSkills ?? [] } })
    .select('id')
    .single();
  if (mErr) throw mErr;
  return { matchId: match.id, jobId: job.id, title };
}

export async function seedProfileWithNullSources(email: string, remoteType: 'hybrid' | 'office') {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { error } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'Legacy profile', keywords: ['react'], remote_type: remoteType, sources: null });
  if (error) throw error;
}

export async function countApplications(email: string): Promise<number> {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { count, error } = await db.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function seedApplication(
  email: string,
  opts: { column?: string; title?: string; appliedDaysAgo?: number; nextActionInHours?: number } = {},
) {
  const db = admin();
  const userId = await userIdByEmail(email);
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = opts.title ?? `Full Stack Engineer ${tag}`;
  const { data: col, error: cErr } = await db.from('board_columns').select('id').eq('user_id', userId).eq('key', opts.column ?? 'applied').single();
  if (cErr) throw cErr;
  const day = 24 * 3600 * 1000;
  const { data, error } = await db
    .from('applications')
    .insert({
      user_id: userId,
      column_id: col.id,
      rank: rankAtEnd(null),
      title,
      company: `Acme ${tag}`,
      url: `https://jobs.dou.ua/vacancies/${tag}/`,
      applied_at: opts.appliedDaysAgo != null ? new Date(Date.now() - opts.appliedDaysAgo * day).toISOString() : null,
      next_action_at: opts.nextActionInHours != null ? new Date(Date.now() + opts.nextActionInHours * 3600 * 1000).toISOString() : null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, title };
}

export async function applicationColumnKey(id: string): Promise<string | null> {
  const db = admin();
  const { data: app, error } = await db.from('applications').select('column_id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!app) return null;
  const { data: col, error: cErr } = await db.from('board_columns').select('key').eq('id', app.column_id).single();
  if (cErr) throw cErr;
  return col.key;
}

export async function matchState(matchId: string): Promise<string | null> {
  const { data, error } = await admin().from('job_matches').select('state').eq('id', matchId).maybeSingle();
  if (error) throw error;
  return data?.state ?? null;
}

export async function seedCv(email: string) {
  const db = admin();
  const userId = await userIdByEmail(email);
  const path = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error: uErr } = await db.storage.from('resumes').upload(path, readFileSync(join(__dirname, '..', 'fixtures', 'cv.pdf')), { contentType: 'application/pdf' });
  if (uErr) throw uErr;
  const parsed = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
  const { error } = await db.from('resumes').insert({ user_id: userId, storage_path: path, file_name: 'cv.pdf', parsed, is_primary: true });
  if (error) throw error;
}

export async function seedBankAnswer(email: string, key: string, answerEn: string) {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { error } = await db.from('answer_bank').upsert({ user_id: userId, key, question: key, answer: { en: answerEn } }, { onConflict: 'user_id,key' });
  if (error) throw error;
}

export async function seedCardFromJob(email: string, jobId: string, title: string, column = 'saved') {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { data: col, error: cErr } = await db.from('board_columns').select('id').eq('user_id', userId).eq('key', column).single();
  if (cErr) throw cErr;
  const { error } = await db.from('applications').insert({ user_id: userId, job_id: jobId, column_id: col.id, rank: rankAtEnd(null), title, company: 'Acme' });
  if (error) throw error;
}

export async function applicationLetter(email: string, jobId: string) {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { data, error } = await db.from('applications').select('letter_kind, letter_used, column_id').eq('user_id', userId).eq('job_id', jobId).maybeSingle();
  if (error) throw error;
  return data ? { kind: data.letter_kind, used: data.letter_used } : null;
}

export async function exhaustPrivateAi(email: string) {
  const userId = await userIdByEmail(email);
  const { error } = await admin().from('ai_user_usage').upsert({ user_id: userId, day: new Date().toISOString().slice(0, 10), requests: 1000 });
  if (error) throw error;
}
