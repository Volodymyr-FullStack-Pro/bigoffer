import { z } from 'zod';
import { detectRemote, detectSeniority, parseSalary } from './detect';
import { fingerprint, normalizeCompany, normalizeTitle, regionBucket } from './normalize';
import { normalizeRemoteRegions } from './regions';
import { decodeEntities, htmlToText, normalizeWhitespace } from './text';

export const SOURCE_IDS = ['dou', 'djinni', 'robotaua'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const REMOTE_TYPES = ['remote', 'hybrid', 'office', 'unknown'] as const;
export type RemoteType = (typeof REMOTE_TYPES)[number];

export const SENIORITIES = ['intern', 'junior', 'middle', 'senior', 'lead'] as const;
export type Seniority = (typeof SENIORITIES)[number];

const cleanText = z.string().transform((s) => normalizeWhitespace(decodeEntities(s))).pipe(z.string().min(1));

const TITLE_MAX = 200;
const TITLE_CUT = 140;

/** Some sources put a whole paragraph in the title; keep it readable instead of rejecting the job. */
export function capTitle(title: string): string {
  if (title.length <= TITLE_MAX) return title;
  const head = title.slice(0, TITLE_CUT + 1);
  const space = head.lastIndexOf(' ');
  const cut = (space > TITLE_CUT / 2 ? head.slice(0, space) : title.slice(0, TITLE_CUT)).replace(/[\s,;:|—–-]+$/, '');
  return `${cut}…`;
}

export const rawJobSchema = z.object({
  externalId: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  title: cleanText.transform(capTitle),
  company: cleanText,
  /** The adapter had no real company and filled in a source name; never dedupe across such jobs. */
  companyIsPlaceholder: z.boolean().optional(),
  description: z.string().default(''),
  location: z.string().nullable().default(null),
  salaryRaw: z.string().nullable().default(null),
  salaryPeriod: z.enum(['month', 'year']).optional(),
  postedAt: z
    .union([z.string(), z.number(), z.date()])
    .nullable()
    .default(null)
    .transform((v) => {
      if (v == null || v === '') return null;
      const numeric = typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v;
      if (typeof numeric === 'number' && !(numeric > 0)) return null;
      const d =
        typeof numeric === 'number' ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(numeric);
      if (Number.isNaN(d.getTime())) return null;
      // A posting is never newer than "now": a future stamp is a zone mix-up on the board's side.
      return d.getTime() > Date.now() ? new Date() : d;
    }),
  remoteHint: z.enum(REMOTE_TYPES).optional(),
  /** Where a remote hire may live, as the board states it (region codes or ISO countries). */
  remoteRegions: z.array(z.string()).optional(),
  tags: z.array(z.string()).default([]),
});

export type RawJob = z.input<typeof rawJobSchema>;

export type NormalizedJob = {
  externalId: string;
  url: string;
  title: string;
  /** normalizeTitle(title): the canonical form used for fuzzy dedupe. */
  canonicalTitle: string;
  company: string;
  companyNormalized: string;
  companyIsPlaceholder: boolean;
  descriptionText: string;
  location: string | null;
  remoteType: RemoteType;
  seniority: Seniority | null;
  salaryRaw: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  postedAt: Date | null;
  tags: string[];
  /** Board-stated hiring regions; authoritative over AI guesses. Empty when unknown. */
  remoteRegions: string[];
  fingerprint: string;
};

export async function normalizeJob(raw: RawJob): Promise<NormalizedJob | null> {
  const parsed = rawJobSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  const descriptionText = htmlToText(r.description).slice(0, 20_000);
  const location = r.location ? normalizeWhitespace(decodeEntities(r.location)) || null : null;
  const remoteType =
    (r.remoteHint !== 'unknown' ? r.remoteHint : undefined) ?? detectRemote(`${r.title} ${location ?? ''} ${descriptionText.slice(0, 3000)}`);
  const salary = r.salaryRaw ? parseSalary(r.salaryRaw, r.salaryPeriod) : null;
  const companyNormalized = normalizeCompany(r.company) || r.company.toLowerCase();

  return {
    externalId: r.externalId,
    url: r.url,
    title: r.title,
    canonicalTitle: normalizeTitle(r.title),
    company: r.company,
    companyNormalized,
    companyIsPlaceholder: r.companyIsPlaceholder === true,
    descriptionText,
    location,
    remoteType,
    seniority: detectSeniority(r.title),
    salaryRaw: r.salaryRaw,
    salaryMinUsd: salary?.minUsd ?? null,
    salaryMaxUsd: salary?.maxUsd ?? null,
    postedAt: r.postedAt,
    tags: r.tags,
    remoteRegions: normalizeRemoteRegions(r.remoteRegions ?? []),
    fingerprint: await fingerprint({
      company: r.company,
      title: r.title,
      // A placeholder company says nothing about identity: key the job by its posting instead.
      region: r.companyIsPlaceholder ? `anon:${r.externalId}` : regionBucket(location, remoteType),
    }),
  };
}
