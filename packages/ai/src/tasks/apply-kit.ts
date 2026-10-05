import { z } from 'zod';
import type { LlmClient } from '../types';
import { cvToPrompt, type ParsedCv } from './parse-cv';

export const applyKitWireSchema = z.object({
  lang: z.string().describe('ISO 639-1 code of the language you wrote the letter in'),
  requirements: z.array(z.object({ text: z.string(), status: z.enum(['met', 'missing', 'unknown']) })),
  red_flags: z.array(z.string()),
  cover_letter: z.string(),
  short_message: z.string(),
  salary_hint: z.string().nullable(),
});

export type ApplyKit = {
  lang: string;
  requirements: { text: string; status: 'met' | 'missing' | 'unknown' }[];
  redFlags: string[];
  coverLetter: string;
  shortMessage: string;
  salaryHint: string | null;
};
export type KitJob = { title: string; company: string; description: string; salary: string | null };

const LANG_NAME: Record<string, string> = { en: 'English', uk: 'Ukrainian', ru: 'Russian' };

function system(lang: 'auto' | 'en' | 'uk' | 'ru', tone: 'default' | 'shorter' | 'formal'): string {
  return [
    'You help a candidate apply to one job. Use ONLY facts from the candidate CV; never invent experience, employers, numbers or skills.',
    lang === 'auto' ? 'Write the letter and the short message in the language of the job posting.' : `Write the letter and the short message in ${LANG_NAME[lang]}.`,
    'Cover letter: if a template is given, keep it verbatim and replace only the [...] placeholders with specific lines about this job; otherwise write 120–180 words.',
    tone === 'shorter' ? 'Make the letter noticeably shorter (≤ 90 words).' : tone === 'formal' ? 'Use a formal tone.' : 'Friendly professional tone.',
    'Short message: at most 450 characters, for a recruiter chat (Djinni, LinkedIn, Telegram).',
    'Requirements: up to 10 must-haves from the job, each marked met / missing / unknown against the CV.',
    'Red flags: up to 5 concrete concerns stated in the posting (unpaid trial, 6-day week, unclear salary, etc.); empty if none.',
    'Salary hint: one sentence using the job salary (if any) and the candidate minimum; null if nothing to say.',
  ].join('\n');
}

export async function generateApplyKit(
  llm: LlmClient,
  input: { job: KitJob; cv: ParsedCv; template: string | null; lang: 'auto' | 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal'; salaryMinUsd: number | null },
): Promise<ApplyKit> {
  const prompt = [
    `Job: ${input.job.title} at ${input.job.company}`,
    `Job salary: ${input.job.salary ?? 'not stated'}`,
    `Candidate minimum: ${input.salaryMinUsd ? `$${input.salaryMinUsd}/month` : 'not set'}`,
    'Job description:',
    input.job.description.slice(0, 6000),
    '',
    'Candidate CV:',
    cvToPrompt(input.cv),
    '',
    input.template ? `Letter template:\n${input.template.slice(0, 3000)}` : 'No letter template.',
  ].join('\n');
  const res = await llm.generateJson({
    sensitivity: 'private',
    task: 'apply_kit',
    schema: applyKitWireSchema,
    system: system(input.lang, input.tone),
    prompt,
    maxOutputTokens: 2500,
  });
  const w = res.data;
  const lang = /^[a-z]{2}$/.test(w.lang.trim().toLowerCase()) ? w.lang.trim().toLowerCase() : input.lang === 'auto' ? 'en' : input.lang;
  return {
    lang,
    requirements: w.requirements.slice(0, 10).map((r) => ({ text: r.text.trim().slice(0, 200), status: r.status })).filter((r) => r.text),
    redFlags: w.red_flags.map((f) => f.trim().slice(0, 200)).filter(Boolean).slice(0, 5),
    coverLetter: w.cover_letter.trim().slice(0, 6000),
    shortMessage: w.short_message.trim().slice(0, 500),
    salaryHint: w.salary_hint?.trim().slice(0, 300) || null,
  };
}
