import { boardLink, decodeEntities, kyivLocalDate, type RawJob, type SourceId } from '@jp/core';
import { toRawJob } from './adapters/djinni';
import { splitDouTitle } from './adapters/dou';
import { salaryRaw } from './adapters/robotaua';
import { extractJobPostings } from './jsonld';
import type { AdapterContext } from './types';

/** One posting read from its own page, by the link a user pastes. */
export type FetchedPosting = { sourceId: SourceId; job: RawJob; recruiter: string | null };

const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** A DOU vacancy page: title, company, place, salary and the description block (DOU has no JobPosting JSON-LD). */
export function parseDouPage(html: string, url: string, id: string): RawJob | null {
  const title = text(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '');
  if (!title) return null;
  const company = text(/class="l-n"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(html)?.[1] ?? '') || null;
  const location = text(/class="place[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i.exec(html)?.[1] ?? '') || null;
  const salary = text(/class="salary"[^>]*>([\s\S]*?)<\/span>/i.exec(html)?.[1] ?? '') || null;
  const start = html.indexOf('<div class="b-typo vacancy-section"');
  // The text ends where the page's scripts, share buttons or reply form begin.
  const ends = ['<script', 'class="likely"', 'class="reply'].map((m) => html.indexOf(m, start)).filter((i) => i > start);
  const description = start >= 0 ? html.slice(start, ends.length ? Math.min(...ends) : start + 40_000) : '';
  const split = splitDouTitle(title);
  return {
    externalId: id,
    url,
    title: split.title || title,
    company: company ?? split.company ?? 'DOU',
    companyIsPlaceholder: !company && !split.company,
    description,
    location: location ?? split.location,
    ...(salary || split.salary ? { salaryRaw: salary ?? split.salary, salaryPeriod: 'month' as const } : {}),
    remoteHint: location?.includes('віддалено') ? 'remote' : undefined,
  };
}

type RabotaVacancy = {
  id: number;
  name: string;
  companyName?: string;
  cityName?: string;
  date?: string;
  salary?: number;
  salaryFrom?: number;
  salaryTo?: number;
  notebookId: number;
  description?: string;
  contactPerson?: string;
};

/**
 * Reads one vacancy from DOU, Djinni or robota.ua by its link, with the board's own data (company, salary,
 * full description), even when the posting is no longer active. Null when the link is not a vacancy of these boards.
 */
export async function fetchPosting(raw: string, ctx: AdapterContext): Promise<FetchedPosting | null> {
  const link = boardLink(raw);
  if (!link) return null;
  if (link.sourceId === 'robotaua') {
    const d = await ctx.fetchJson<RabotaVacancy>(`https://api.rabota.ua/vacancy?id=${link.id}`);
    if (!d?.name) return null;
    const company = d.companyName?.trim();
    return {
      sourceId: 'robotaua',
      recruiter: d.contactPerson?.trim() || null,
      job: {
        externalId: String(d.id),
        url: `https://robota.ua/company${d.notebookId}/vacancy${d.id}`,
        title: d.name,
        company: company || 'robota.ua',
        companyIsPlaceholder: !company,
        description: d.description ?? '',
        location: d.cityName || null,
        salaryRaw: salaryRaw(d),
        salaryPeriod: 'month',
        postedAt: d.date ? kyivLocalDate(d.date) : null,
      },
    };
  }
  const html = await ctx.fetchText(link.url);
  if (link.sourceId === 'djinni') {
    const ld = extractJobPostings(html)[0];
    const job = ld ? toRawJob(ld, link.url) : null;
    return job ? { sourceId: 'djinni', job, recruiter: null } : null;
  }
  const job = parseDouPage(html, link.url, link.id);
  return job ? { sourceId: 'dou', job, recruiter: null } : null;
}
