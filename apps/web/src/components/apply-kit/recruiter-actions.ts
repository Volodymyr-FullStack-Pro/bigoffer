'use server';

import type { Json } from '@jp/db';
import { getUserId } from '@/lib/auth';
import { recruiterMessage, type MessageFormat } from '@jp/ai';
import { textLang } from '@jp/core';
import { consumePrivateAi, getLlm, privateAiAvailable } from '@/lib/ai';
import { cvSignedUrl, loadPrimaryCv } from '@/lib/cv';
import { companyKey, contactsFromDescription, type RankedContact, rankRecruiters, hrContactQuery, hrContactsFromResults, type RecruiterContact, recruiterQuery, recruitersFromResults, type SearchResult } from '@/lib/recruiters';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MS = 30 * 24 * 3600 * 1000;

const SEARCH_KEYS = ['TAVILY_API_KEY', 'SERPER_API_KEY', 'BRAVE_SEARCH_API_KEY'] as const;

/** Search results from the first configured provider: Tavily (free monthly quota), Serper, Brave. */
async function webSearch(q: string): Promise<SearchResult[] | null> {
  const tavily = process.env.TAVILY_API_KEY;
  const serper = process.env.SERPER_API_KEY;
  const brave = process.env.BRAVE_SEARCH_API_KEY;
  const signal = AbortSignal.timeout(8000);
  if (tavily) {
    // Tavily takes the domain as a filter instead of a site: operator.
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tavily}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: q.replace(/^site:\S+\s*/, ''),
        ...(q.startsWith('site:linkedin.com') ? { include_domains: ['linkedin.com'] } : {}),
        max_results: 20,
        search_depth: 'basic',
      }),
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: { title: string; url: string; content?: string }[] };
    return (body.results ?? []).map((r) => ({ title: r.title, url: r.url, description: r.content }));
  }
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
  if (!SEARCH_KEYS.some((k) => process.env[k]) || !key || !process.env.SUPABASE_SECRET_KEY) return [];
  const admin = createAdminSupabase();
  const { data: cached } = await admin.from('recruiter_lookups').select('people, fetched_at').eq('company_key', key).maybeSingle();
  const previous = (cached?.people as RecruiterContact[] | undefined) ?? [];
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MS) return previous;
  try {
    // Two searches per company (cached for a month): recruiters' LinkedIn profiles, then any site for HR contacts.
    const [profiles, broad] = await Promise.all([webSearch(recruiterQuery(company)), webSearch(hrContactQuery(company))]);
    if (!profiles && !broad) return previous;
    const fromBroad = broad ?? [];
    const people = [
      ...recruitersFromResults([...(profiles ?? []), ...fromBroad], company),
      ...hrContactsFromResults(fromBroad, company),
    ].slice(0, 4);
    await admin.from('recruiter_lookups').upsert({ company_key: key, people: people as unknown as NonNullable<Json>, fetched_at: new Date().toISOString() });
    return people;
  } catch {
    return previous;
  }
}

/** Who to write to about this vacancy: contacts the posting names first, then the company's recruiters. */
export async function findRecruiters(jobId: string): Promise<RankedContact[]> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId)) return [];
  const supabase = await createClient();
  const { data: job } = await supabase.from('jobs').select('description_text, company_is_placeholder, companies(name)').eq('id', jobId).maybeSingle();
  if (!job) return [];
  const own = contactsFromDescription(job.description_text ?? '');
  const company = job.companies?.name?.trim();
  const found = company && !job.company_is_placeholder ? await searchRecruiters(company) : [];
  const seen = new Set(own.map((c) => c.href));
  return rankRecruiters([...own, ...found.filter((c) => !seen.has(c.href))]).slice(0, 4);
}

const FORMAT_FOR: Record<RecruiterContact['kind'], MessageFormat> = { linkedin: 'inmail', email: 'email', telegram: 'telegram' };
const SIGN: Record<'en' | 'uk' | 'ru', { cv: string; contacts: string }> = {
  en: { cv: 'CV', contacts: 'Contacts' },
  uk: { cv: 'Резюме', contacts: 'Контакти' },
  ru: { cv: 'Резюме', contacts: 'Контакты' },
};

/**
 * A first message to one recruiter about this job: written by AI from the job and the CV, in the job's language
 * unless one is chosen, ending with the candidate's CV link and contacts (added as is, never invented).
 */
export async function recruiterNote(
  jobId: string,
  to: { kind: RecruiterContact['kind']; label: string },
  langChoice: 'auto' | 'en' | 'uk' | 'ru' = 'auto',
): Promise<{ ok: true; subject: string | null; body: string } | { ok: false; error: 'ai_unavailable' | 'ai_limit' | 'no_cv' | 'not_found' | 'failed' }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !FORMAT_FOR[to.kind] || typeof to.label !== 'string') return { ok: false, error: 'not_found' };
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const [{ data: job }, cv, { data: me }] = await Promise.all([
    supabase.from('jobs').select('title, description_text, companies(name)').eq('id', jobId).maybeSingle(),
    loadPrimaryCv(supabase),
    supabase.from('profiles').select('contacts, full_name').eq('id', userId).single(),
  ]);
  if (!job) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };
  const lang = langChoice === 'auto' ? textLang(`${job.title}\n${(job.description_text ?? '').slice(0, 1500)}`) : langChoice;
  // A person's first name; for an e-mail or Telegram handle there is no name to greet.
  const name = to.kind === 'linkedin' ? to.label.trim().split(/\s+/)[0] ?? null : null;
  try {
    const res = await recruiterMessage(getLlm(), {
      format: FORMAT_FOR[to.kind],
      kind: 'intro',
      job: { title: job.title, company: job.companies?.name ?? '', description: job.description_text },
      cv: cv.parsed,
      recruiterName: name,
      candidateName: me?.full_name?.trim() || cv.parsed.fullName?.trim() || null,
      lang,
      tone: 'shorter',
      previous: [],
    });
    const contacts = (me?.contacts ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof contacts[k] === 'string' && (contacts[k] as string).trim() ? (contacts[k] as string).trim() : null);
    // The user's stable CV link first; else a 30-day link to the uploaded file.
    const cvLink = str('cv') ?? (cv.path ? await cvSignedUrl(supabase, cv.path) : null);
    const lines = [
      cvLink ? `${SIGN[lang].cv}: ${cvLink}` : null,
      // A recruiter needs one more way to answer, not the full list: skip the channel the message already goes through.
      ...[['Email', 'email', str('email')], ['Telegram', 'telegram', str('telegram')], ['LinkedIn', 'linkedin', str('linkedin')]]
        .filter(([, kind, v]) => v && kind !== to.kind)
        .map(([k, , v]) => [k, v])
        .map(([k, v]) => `${k}: ${v}`),
    ].filter((l): l is string => Boolean(l));
    const body = lines.length > 0 ? `${res.body}\n\n${lines.join('\n')}` : res.body;
    return { ok: true, subject: res.subject, body };
  } catch (err) {
    console.error('recruiterNote failed', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: 'failed' };
  }
}
