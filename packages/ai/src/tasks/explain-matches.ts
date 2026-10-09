import type { Locale, RemoteType, Seniority } from '@jp/core';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../types';

export const EXPLAIN_BATCH = 10;

export const explainWireSchema = z.object({
  items: z.array(z.object({ n: z.number().describe('Job number from the list'), why: z.string() })),
});

/** The user's search criteria only: no name, contacts, CV or country (public-key data, see spec 12.2). */
export type ExplainCriteria = {
  keywords: string[];
  skills: string[];
  seniority: Seniority[];
  remoteType: 'any' | 'remote' | 'hybrid' | 'office';
  salaryMinUsd: number | null;
};

export type ExplainJob = {
  id: string;
  title: string;
  company: string;
  summary: string | null;
  skills: string[];
  matchedSkills: string[];
  seniority: Seniority | null;
  remoteType: RemoteType;
  location: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
};

const LANGUAGE: Record<Locale, string> = { en: 'English', uk: 'Ukrainian', ru: 'Russian' };

function system(locale: Locale): string {
  return [
    'You help a job seeker scan a list of vacancies picked for them.',
    `For each numbered job write ONE sentence (at most 25 words) in ${LANGUAGE[locale]} on why it fits their search.`,
    'Name concrete overlaps: skills, level, work format, salary. Use only the data given; never invent facts.',
    'No greetings, no generic praise. Return an item for every job number.',
  ].join('\n');
}

function money(min: number | null, max: number | null): string {
  if (min && max && min !== max) return `$${min}-${max}/month`;
  if (min || max) return `$${min ?? max}/month`;
  return 'not stated';
}

function prompt(criteria: ExplainCriteria, jobs: ExplainJob[]): string {
  const lines = [
    'Search criteria:',
    `- keywords: ${criteria.keywords.join(', ') || 'none'}`,
    `- skills: ${criteria.skills.join(', ') || 'none'}`,
    `- level: ${criteria.seniority.join(', ') || 'any'}`,
    `- format: ${criteria.remoteType}`,
    `- minimum salary: ${criteria.salaryMinUsd ? `$${criteria.salaryMinUsd}/month` : 'not set'}`,
    '',
    'Jobs:',
  ];
  jobs.forEach((job, i) => {
    lines.push(
      `#${i + 1} ${job.title} at ${job.company}`,
      `  level: ${job.seniority ?? 'not stated'}; format: ${job.remoteType}${job.location ? `; location: ${job.location}` : ''}`,
      `  salary: ${money(job.salaryMinUsd, job.salaryMaxUsd)}`,
      `  skills: ${job.skills.join(', ') || 'not stated'}; matching the search: ${job.matchedSkills.join(', ') || 'none'}`,
      `  about: ${job.summary ?? 'n/a'}`,
    );
  });
  return lines.join('\n');
}

export async function explainMatches(
  llm: LlmClient,
  args: { locale: Locale; criteria: ExplainCriteria; jobs: ExplainJob[] },
): Promise<{ explanations: Map<string, string>; usage: LlmUsage; model: string }> {
  if (args.jobs.length > EXPLAIN_BATCH) throw new RangeError(`explainMatches takes at most ${EXPLAIN_BATCH} jobs`);
  const res = await llm.generateJson({
    sensitivity: 'public',
    schema: explainWireSchema,
    system: system(args.locale),
    prompt: prompt(args.criteria, args.jobs),
    maxOutputTokens: 1200,
    thinking: 'low',
  });
  const explanations = new Map<string, string>();
  for (const item of res.data.items) {
    const job = Number.isInteger(item.n) ? args.jobs[item.n - 1] : undefined;
    const why = item.why.trim().slice(0, 240);
    if (job && why && !explanations.has(job.id)) explanations.set(job.id, why);
  }
  return { explanations, usage: res.usage, model: res.model };
}
