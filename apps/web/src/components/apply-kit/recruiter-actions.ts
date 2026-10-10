'use server';

import type { Json } from '@jp/db';
import { getUserId } from '@/lib/auth';
import { companyKey, contactsFromDescription, type RecruiterContact, recruiterQuery, recruitersFromResults, type SearchResult } from '@/lib/recruiters';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MS = 30 * 24 * 3600 * 1000;

/** Web results for a query from Serper (Google results) or Brave Search, whichever key is configured. */
async function webSearch(q: string): Promise<SearchResult[] | null> {
  const serper = process.env.SERPER_API_KEY;
  const brave = process.env.BRAVE_SEARCH_API_KEY;
  const signal = AbortSignal.timeout(8000);
  if (serper) {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': serper, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: 20 }),
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { organic?: { title: string; link: string; snippet?: string }[] };
    return (body.organic ?? []).map((r) => ({ title: r.title, url: r.link, description: r.snippet }));
  }
  if (brave) {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q, count: '20' })}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': brave },
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { web?: { results?: SearchResult[] } };
    return body.web?.results ?? [];
  }
  return null;
}

/** Public LinkedIn profiles of the company's recruiters; cached per company for every user. */
async function searchRecruiters(company: string): Promise<RecruiterContact[]> {
  const key = companyKey(company);
  if (!(process.env.SERPER_API_KEY || process.env.BRAVE_SEARCH_API_KEY) || !key || !process.env.SUPABASE_SECRET_KEY) return [];
  const admin = createAdminSupabase();
  const { data: cached } = await admin.from('recruiter_lookups').select('people, fetched_at').eq('company_key', key).maybeSingle();
  const previous = (cached?.people as RecruiterContact[] | undefined) ?? [];
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MS) return previous;
  try {
    const results = await webSearch(recruiterQuery(company));
    if (!results) return previous;
    const people = recruitersFromResults(results, company);
    await admin.from('recruiter_lookups').upsert({ company_key: key, people: people as unknown as Json, fetched_at: new Date().toISOString() });
    return people;
  } catch {
    return previous;
  }
}

/** Who to write to about this vacancy: contacts the posting names first, then the company's recruiters. */
export async function findRecruiters(jobId: string): Promise<RecruiterContact[]> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId)) return [];
  const supabase = await createClient();
  const { data: job } = await supabase.from('jobs').select('description_text, company_is_placeholder, companies(name)').eq('id', jobId).maybeSingle();
  if (!job) return [];
  const own = contactsFromDescription(job.description_text ?? '');
  const company = job.companies?.name?.trim();
  const found = company && !job.company_is_placeholder ? await searchRecruiters(company) : [];
  const seen = new Set(own.map((c) => c.href));
  return [...own, ...found.filter((c) => !seen.has(c.href))].slice(0, 4);
}
