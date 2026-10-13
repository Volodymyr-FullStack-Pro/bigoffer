import type { RemoteType, Seniority } from '@jp/core';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../types';

export const AUDIT_BATCH = 10;
export const AUDIT_FIELDS = ['remote_type', 'seniority', 'salary', 'skills', 'is_job'] as const;
export type AuditField = (typeof AUDIT_FIELDS)[number];

const wire = z.object({
  items: z.array(
    z.object({
      n: z.number().describe('Job number from the list'),
      wrong: z
        .array(z.object({ field: z.enum(AUDIT_FIELDS), correct: z.string().describe('What the posting actually says, briefly') }))
        .catch([])
        .describe('Only the stored fields the posting contradicts; empty when all are right'),
    }),
  ),
});

/** One stored job as the card shows it, next to the posting it came from (public data only). */
export type AuditJob = {
  id: string;
  title: string;
  location: string | null;
  description: string;
  remoteType: RemoteType;
  seniority: Seniority | null;
  salaryRaw: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  skills: string[];
  isJob: boolean | null;
};

export type AuditFinding = { jobId: string; field: AuditField; stored: string; correct: string };

const SYSTEM = [
  'You check facts a job app stored for job postings against the postings themselves.',
  'For each numbered job, list only the stored fields the posting clearly contradicts, with what the posting says.',
  'A field the posting does not mention is not wrong ("unknown"/"not stated" for an unstated value is right).',
  'remote_type: remote / hybrid / office / unknown. seniority: intern / junior / middle / senior / lead or not stated.',
  'salary: stored as the posting\'s own text plus its USD conversion (the app converts currencies itself; never re-convert). Flag only',
  '  when the posting states a different amount than the stored text, or states a salary that is stored as none.',
  'skills: flag only when a listed skill is absent from the posting or a central required skill is missing.',
  'is_job: false only for a course, an ad or a list of many roles.',
].join('\n');

function stored(job: AuditJob, field: AuditField): string {
  switch (field) {
    case 'remote_type':
      return job.remoteType;
    case 'seniority':
      return job.seniority ?? 'not stated';
    case 'salary':
      return job.salaryRaw ? `${job.salaryRaw} (≈ $${job.salaryMinUsd ?? '?'}-${job.salaryMaxUsd ?? '?'}/month)` : 'none';
    case 'skills':
      return job.skills.join(', ') || 'none';
    case 'is_job':
      return String(job.isJob ?? 'not checked');
  }
}

/** Asks the public model which stored card fields contradict their postings; the input is public job data only. */
export async function auditEnrichment(
  llm: LlmClient,
  jobs: AuditJob[],
): Promise<{ findings: AuditFinding[]; usage: LlmUsage; model: string }> {
  if (jobs.length > AUDIT_BATCH) throw new RangeError(`auditEnrichment takes at most ${AUDIT_BATCH} jobs`);
  const prompt = jobs
    .map((job, i) =>
      [
        `#${i + 1} ${job.title}${job.location ? ` (${job.location})` : ''}`,
        `stored: ${AUDIT_FIELDS.map((f) => `${f}=${stored(job, f)}`).join('; ')}`,
        '<posting>',
        job.description.slice(0, 2500),
        '</posting>',
      ].join('\n'),
    )
    .join('\n\n');
  const res = await llm.generateJson({
    sensitivity: 'public',
    task: 'audit_enrichment',
    schema: wire,
    system: SYSTEM,
    prompt,
    maxOutputTokens: 2000,
    thinking: 'low',
  });
  const findings: AuditFinding[] = [];
  for (const item of res.data.items) {
    const job = Number.isInteger(item.n) ? jobs[item.n - 1] : undefined;
    if (!job) continue;
    for (const w of item.wrong) {
      const correct = w.correct.trim().slice(0, 120);
      const value = stored(job, w.field);
      // The model sometimes "corrects" a field to the value it already has.
      if (!correct || correct.toLowerCase() === value.toLowerCase()) continue;
      findings.push({ jobId: job.id, field: w.field, stored: value, correct });
    }
  }
  return { findings, usage: res.usage, model: res.model };
}
