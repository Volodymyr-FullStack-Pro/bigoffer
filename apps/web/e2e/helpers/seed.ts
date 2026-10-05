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
    .insert({ fingerprint: `e2e-${tag}`, title, company_id: company.id, remote_type: 'remote', salary_min_usd: 3000, salary_max_usd: 4500, status: opts.status ?? 'active', seniority: opts.seniority ?? null, skills: opts.skills ?? [], summary: opts.summary ?? null, is_job: opts.isJob ?? null })
    .select('id')
    .single();
  if (jErr) throw jErr;
  const { error: pErr } = await db.from('job_postings').insert({ job_id: job.id, source_id: 'dou', external_id: `e2e-${tag}`, url: `https://jobs.dou.ua/vacancies/${tag}/` });
  if (pErr) throw pErr;
  const { data: match, error: mErr } = await db
    .from('job_matches')
    .insert({ user_id: userId, job_id: job.id, score: opts.score ?? 88, state: opts.state ?? 'new', explanation: opts.explanation ?? null, breakdown: { matchedSkills: opts.matchedSkills ?? [] } })
    .select('id')
    .single();
  if (mErr) throw mErr;
  return { matchId: match.id, title };
}

export async function seedProfileWithNullSources(email: string, remoteType: 'hybrid' | 'office') {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { error } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'Legacy profile', keywords: ['react'], remote_type: remoteType, sources: null });
  if (error) throw error;
}
