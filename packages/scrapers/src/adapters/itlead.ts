import { htmlToText, isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import { extractJobPostings, type JobPostingLd, ldLocation } from '../jsonld';
import { type SourceAdapter, SourceBlockedError } from '../types';

/**
 * ITLead (itlead.org) mostly re-posts Djinni/builtin.com jobs we already scrape; we keep only the agency's own.
 * Discovery: the listing page accepts `?source=itlead` server-side and embeds its cards in the Next.js RSC payload
 * (`self.__next_f.push`) as `{"id":…,"source":"itlead",…}`. One request lists every own vacancy — the sitemap
 * covers only recent ids and has no origin, and JSON-LD on vacancy pages does not tell re-posts apart.
 * Cards are filtered by `source` again in case the site ever ignores the query parameter.
 * Each own vacancy page is then fetched for its JobPosting JSON-LD.
 */
const LISTING = 'https://itlead.org/vacancies?source=itlead';
const VACANCY = 'https://itlead.org/vacancies/';
const OWN = 'itlead';
const MAX_VACANCIES = 40;

/** Concatenated RSC chunks; each push holds a JSON string literal. */
function rscPayload(html: string): string {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      out += JSON.parse(m[1]!) as string;
    } catch {
      // A malformed chunk only loses its own cards.
    }
  }
  return out;
}

export function ownVacancyIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of rscPayload(html).matchAll(/\{"id":(\d+),"source":"([^"]*)"/g)) {
    if (m[2] === OWN) ids.add(m[1]!);
  }
  return [...ids];
}

type ItleadPosting = JobPostingLd & {
  qualifications?: string;
  baseSalary?: { value?: { value?: string | number } };
};

function toRawJob(id: string, p: ItleadPosting): RawJob | null {
  if (!p.title || !isTechTitle(p.title)) return null;
  const org = p.hiringOrganization?.name?.trim();
  // "ITLead" as the employer means an agency posting for an unnamed client.
  const placeholder = !org || org.toLowerCase() === 'itlead';
  const remote = p.jobLocationType === 'TELECOMMUTE';
  const location = ldLocation(p);
  const description = [p.description, p.qualifications]
    .filter((s): s is string => Boolean(s?.trim()))
    .map((s) => htmlToText(s))
    .join('\n\n');
  const salary = p.baseSalary?.value?.value;
  return {
    externalId: id,
    url: `${VACANCY}${id}`,
    title: p.title,
    company: placeholder ? 'ITLead' : org,
    companyIsPlaceholder: placeholder,
    description,
    location,
    salaryRaw: salary != null && String(salary).trim() ? String(salary) : null,
    postedAt: p.datePosted ?? null,
    remoteHint: remote ? 'remote' : undefined,
    remoteRegions: remote && location ? regionsFromLocation(location) : undefined,
  };
}

export const itleadAdapter: SourceAdapter = {
  id: 'itlead',
  async search(_params, ctx) {
    const ids = ownVacancyIds(await ctx.fetchText(LISTING)).slice(0, MAX_VACANCIES);
    const out: RawJob[] = [];
    // Sequential: the HTTP context paces requests to the same host.
    for (const id of ids) {
      let html: string;
      try {
        html = await ctx.fetchText(`${VACANCY}${id}`);
      } catch (err) {
        if (err instanceof SourceBlockedError) throw err;
        continue;
      }
      const posting = extractJobPostings(html)[0] as ItleadPosting | undefined;
      const job = posting ? toRawJob(id, posting) : null;
      if (job) out.push(job);
    }
    return out;
  },
};
