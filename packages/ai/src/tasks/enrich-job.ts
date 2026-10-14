import {
  LOCALES,
  type LocalizedText,
  namedPlatforms,
  normalizeRemoteRegions,
  REMOTE_REGIONS,
  REMOTE_TYPES,
  type RemoteType,
  SALARY_PERIODS,
  salaryToMonthlyUsd,
  SENIORITIES,
  type Seniority,
} from '@jp/core';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../types';

/**
 * What the model returns. Plain schema (no transforms): it is sent as JSON Schema. Providers behind OpenRouter don't
 * always enforce it (e.g. "staff" or "unknown" for a nullable enum), so optional facts fall back to empty via
 * `.catch()` instead of failing the whole job.
 */
export const enrichWireSchema = z.object({
  is_job: z.boolean().describe('false if this is not one concrete vacancy: a course, an ad, a list of many roles, spam'),
  role: z.string().describe('Normalized role title in English without seniority, e.g. "Frontend Developer", "Accountant"'),
  seniority: z.enum(SENIORITIES).nullable().catch(null).describe('Required level; null if not stated'),
  skills: z.array(z.string()).catch([]).describe('Up to 15 concrete required skills/tools, canonical names, e.g. "React", "PostgreSQL", "Excel"'),
  salary: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable().describe('ISO 4217 code, e.g. USD, EUR, UAH, PLN, GBP'),
      period: z.enum(SALARY_PERIODS).nullable().catch(null),
    })
    .nullable()
    .catch(null)
    .describe('Gross salary as stated in the posting; null if absent'),
  remote_type: z.enum(REMOTE_TYPES).catch('unknown'),
  remote_regions: z
    .array(z.string())
    .catch([])
    .describe(
      `For remote jobs: where candidates may live. "worldwide" if unrestricted, else region codes (${REMOTE_REGIONS.join(', ')}) or ISO 3166-1 alpha-2 country codes. Empty if not stated.`,
    ),
  lang: z.string().describe('ISO 639-1 code of the posting language'),
  summary: z
    .object({ en: z.string(), uk: z.string(), ru: z.string() })
    .describe('Two short factual sentences about the role and the company, in English, Ukrainian and Russian'),
});
export type EnrichWire = z.output<typeof enrichWireSchema>;

export type EnrichJobInput = {
  title: string;
  company: string;
  location: string | null;
  salaryRaw: string | null;
  tags: string[];
  descriptionText: string;
};

export type JobEnrichment = {
  isJob: boolean;
  role: string | null;
  seniority: Seniority | null;
  skills: string[];
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  remoteType: RemoteType;
  remoteRegions: string[];
  lang: string | null;
  summary: LocalizedText;
};

const MAX_DESCRIPTION = 6000;
const MAX_SKILLS = 15;

const SYSTEM = [
  'You extract structured facts from ONE job posting for a job search app.',
  'Use only information present in the posting; never guess a salary, level or region that is not stated.',
  'Skills: concrete technologies, tools or professional skills the candidate needs, not soft-skill fluff. Put first the platform or',
  'language the work is built on (e.g. WordPress, WooCommerce, PHP, .NET, Java, Shopify) and include every technology the posting',
  'names as required or used; never add one the posting does not mention (no React for a WordPress site).',
  'Work format: "remote" only when the posting or location says remote / віддалено / удаленно / work from home; a city or office address',
  'without that is "office", or "hybrid" when it mentions hybrid or some office days; "unknown" only when neither is stated.',
  'Summaries: plain and factual, no marketing language, no emojis.',
].join('\n');

export function buildEnrichPrompt(input: EnrichJobInput): string {
  const missing = '(not stated)';
  return [
    `Title: ${input.title}`,
    `Company: ${input.company}`,
    `Location: ${input.location ?? missing}`,
    `Salary: ${input.salaryRaw ?? missing}`,
    `Tags: ${input.tags.length > 0 ? input.tags.join(', ') : missing}`,
    'Description:',
    input.descriptionText.slice(0, MAX_DESCRIPTION),
  ].join('\n');
}

function cleanSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const skill = value.trim();
    const key = skill.toLowerCase();
    if (!skill || skill.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

export function normalizeEnrichment(w: EnrichWire): JobEnrichment {
  const salary = w.salary ? salaryToMonthlyUsd(w.salary) : null;
  const summary: LocalizedText = {};
  for (const locale of LOCALES) {
    const text = w.summary[locale].trim().slice(0, 400);
    if (text) summary[locale] = text;
  }
  const role = w.role.trim().slice(0, 80);
  const lang = w.lang.trim().toLowerCase();
  return {
    isJob: w.is_job,
    role: role || null,
    seniority: w.seniority,
    skills: cleanSkills(w.skills),
    salaryMinUsd: salary?.minUsd ?? null,
    salaryMaxUsd: salary?.maxUsd ?? null,
    remoteType: w.remote_type,
    remoteRegions: normalizeRemoteRegions(w.remote_regions),
    lang: /^[a-z]{2}$/.test(lang) ? lang : null,
    summary,
  };
}

export async function enrichJob(
  llm: LlmClient,
  input: EnrichJobInput,
): Promise<{ enrichment: JobEnrichment; usage: LlmUsage; model: string }> {
  const res = await llm.generateJson({
    sensitivity: 'public',
    schema: enrichWireSchema,
    system: SYSTEM,
    prompt: buildEnrichPrompt(input),
    maxOutputTokens: 1500,
    thinking: 'low',
  });
  const enrichment = normalizeEnrichment(res.data);
  // Safety net: a platform the posting names leads the skills even when the model left it out.
  const named = namedPlatforms(`${input.title}\n${input.descriptionText}`, enrichment.skills);
  if (named.length > 0) enrichment.skills = [...named, ...enrichment.skills].slice(0, MAX_SKILLS);
  return { enrichment, usage: res.usage, model: res.model };
}
