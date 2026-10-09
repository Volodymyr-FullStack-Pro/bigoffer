import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { explainMatches, type ExplainCriteria, type ExplainJob } from './explain-matches';

const criteria: ExplainCriteria = { keywords: ['frontend'], skills: ['React'], seniority: ['senior'], remoteType: 'remote', salaryMinUsd: 4000 };
const job = (id: string): ExplainJob => ({
  id,
  title: `Frontend ${id}`,
  company: 'Acme',
  summary: 'Payments team.',
  skills: ['React', 'Kafka'],
  matchedSkills: ['React'],
  seniority: 'senior',
  remoteType: 'remote',
  location: null,
  salaryMinUsd: 5000,
  salaryMaxUsd: null,
});

describe('explainMatches', () => {
  it('numbers jobs, asks in the user language and maps answers back by number', async () => {
    const llm = new FakeLlmClient(() => ({
      items: [
        { n: 2, why: ' React і senior — як у вашому пошуку. ' },
        { n: 1, why: 'Підходить за React.' },
        { n: 7, why: 'unknown number' },
        { n: 3, why: '  ' },
      ],
    }));
    const res = await explainMatches(llm, { locale: 'uk', criteria, jobs: [job('a'), job('b'), job('c')] });
    expect([...res.explanations.entries()]).toEqual([
      ['b', 'React і senior — як у вашому пошуку.'],
      ['a', 'Підходить за React.'],
    ]);
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.thinking).toBe('low');
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.prompt).toMatch(/^#1 Frontend a/m);
    expect(llm.calls[0]!.prompt).toMatch(/^#3 Frontend c/m);
    expect(llm.calls[0]!.prompt).toContain('frontend');
  });

  it('refuses more than ten jobs per call', async () => {
    const llm = new FakeLlmClient(() => ({ items: [] }));
    const jobs = Array.from({ length: 11 }, (_, i) => job(String(i)));
    await expect(explainMatches(llm, { locale: 'en', criteria, jobs })).rejects.toBeInstanceOf(RangeError);
    expect(llm.calls).toHaveLength(0);
  });
});
