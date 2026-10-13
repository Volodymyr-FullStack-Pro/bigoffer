import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { auditEnrichment, type AuditJob } from './audit-enrichment';

const job = (id: string, over: Partial<AuditJob> = {}): AuditJob => ({
  id,
  title: 'Frontend Developer',
  location: 'Київ',
  description: 'Remote. React, TypeScript. Salary $3000.',
  remoteType: 'remote',
  seniority: 'middle',
  salaryRaw: '$3000',
  salaryMinUsd: 3000,
  salaryMaxUsd: null,
  skills: ['React', 'TypeScript'],
  isJob: true,
  ...over,
});

describe('auditEnrichment', () => {
  it('maps the wrong fields back to jobs with what is stored and ignores unknown numbers', async () => {
    const llm = new FakeLlmClient(
      () => ({ items: [{ n: 2, wrong: [{ field: 'remote_type', correct: 'office in Kyiv' }, { field: 'seniority', correct: 'Middle' }] }, { n: 9, wrong: [{ field: 'salary', correct: 'x' }] }] }),
      ['public'],
    );
    const { findings } = await auditEnrichment(llm, [job('a'), job('b', { remoteType: 'remote' })]);
    expect(findings).toEqual([{ jobId: 'b', field: 'remote_type', stored: 'remote', correct: 'office in Kyiv' }]);
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.prompt).toContain('stored: remote_type=remote; seniority=middle; salary=$3000 (≈ $3000-?/month)');
  });

  it('takes at most one batch', async () => {
    const llm = new FakeLlmClient(() => ({ items: [] }), ['public']);
    await expect(auditEnrichment(llm, Array.from({ length: 11 }, (_, i) => job(String(i))))).rejects.toThrow(RangeError);
  });
});
