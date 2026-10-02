import { z } from 'zod';
import { detectRemote, detectSeniority, parseSalary } from './detect';
import { fingerprint, normalizeCompany, regionBucket } from './normalize';
import { decodeEntities, htmlToText, normalizeWhitespace } from './text';

export const SOURCE_IDS = [
  'dou', 'djinni', 'robotaua', 'jooble', 'remoteok', 'remotive', 'himalayas', 'wwr', 'hn',
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const REMOTE_TYPES = ['remote', 'hybrid', 'office', 'unknown'] as const;
export type RemoteType = (typeof REMOTE_TYPES)[number];

export const SENIORITIES = ['intern', 'junior', 'middle', 'senior', 'lead'] as const;
export type Seniority = (typeof SENIORITIES)[number];

const cleanText = z.string().transform((s) => normalizeWhitespace(decodeEntities(s))).pipe(z.string().min(1));

export const rawJobSchema = z.object({
  externalId: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  title: cleanText,
  company: cleanText,
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
      return Number.isNaN(d.getTime()) ? null : d;
    }),
  remoteHint: z.enum(REMOTE_TYPES).optional(),
  tags: z.array(z.string()).default([]),
});

export type RawJob = z.input<typeof rawJobSchema>;

export type NormalizedJob = {
  externalId: string;
  url: string;
  title: string;
  company: string;
  companyNormalized: string;
  descriptionText: string;
  location: string | null;
  remoteType: RemoteType;
  seniority: Seniority | null;
  salaryRaw: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  postedAt: Date | null;
  tags: string[];
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
    company: r.company,
    companyNormalized,
    descriptionText,
    location,
    remoteType,
    seniority: detectSeniority(r.title),
    salaryRaw: r.salaryRaw,
    salaryMinUsd: salary?.minUsd ?? null,
    salaryMaxUsd: salary?.maxUsd ?? null,
    postedAt: r.postedAt,
    tags: r.tags,
    fingerprint: await fingerprint({
      company: r.company,
      title: r.title,
      region: regionBucket(location, remoteType),
    }),
  };
}
