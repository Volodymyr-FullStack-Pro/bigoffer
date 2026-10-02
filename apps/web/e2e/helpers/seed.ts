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

export async function seedMatch(email: string, opts: { title?: string; score?: number } = {}) {
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
    .insert({ fingerprint: `e2e-${tag}`, title, company_id: company.id, remote_type: 'remote', salary_min_usd: 3000, salary_max_usd: 4500 })
    .select('id')
    .single();
  if (jErr) throw jErr;
  const { error: pErr } = await db.from('job_postings').insert({ job_id: job.id, source_id: 'dou', external_id: `e2e-${tag}`, url: `https://jobs.dou.ua/vacancies/${tag}/` });
  if (pErr) throw pErr;
  const { data: match, error: mErr } = await db
    .from('job_matches')
    .insert({ user_id: userId, job_id: job.id, score: opts.score ?? 88 })
    .select('id')
    .single();
  if (mErr) throw mErr;
  return { matchId: match.id, title };
}
