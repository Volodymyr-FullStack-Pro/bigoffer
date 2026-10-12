import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { toResponseJsonSchema } from '../json-schema';
import { buildEnrichPrompt, enrichJob, enrichWireSchema, normalizeEnrichment, type EnrichJobInput } from './enrich-job';

const wire = {
  is_job: true,
  role: '  Frontend Developer ',
  seniority: 'senior',
  skills: ['React', ' react ', 'TypeScript', '', 'x'.repeat(41)],
  salary: { min: 4500, max: 5500, currency: 'EUR', period: 'month' },
  remote_type: 'remote',
  remote_regions: ['Europe', 'eu', 'Mars'],
  lang: 'EN',
  summary: { en: ' Builds the checkout. ', uk: 'Створює оформлення замовлення.', ru: '' },
} as const;

const input: EnrichJobInput = {
  title: 'Senior Frontend Developer',
  company: 'Acme',
  location: 'Remote (EU)',
  salaryRaw: '€4,500–5,500',
  tags: ['react'],
  descriptionText: 'a'.repeat(10_000),
};

describe('enrichWireSchema', () => {
  it('drops facts that break the schema instead of failing the job', () => {
    const broken = { ...wire, seniority: 'staff', salary: 'unknown', remote_type: 'onsite', skills: null, remote_regions: 'EU' };
    expect(enrichWireSchema.parse(broken)).toMatchObject({
      seniority: null,
      salary: null,
      remote_type: 'unknown',
      skills: [],
      remote_regions: [],
    });
  });

  it('keeps catch defaults out of the JSON Schema', () => {
    expect(JSON.stringify(toResponseJsonSchema(enrichWireSchema))).not.toContain('default');
  });
});

describe('normalizeEnrichment', () => {
  it('cleans and converts the model output', () => {
    expect(normalizeEnrichment(structuredClone(wire) as never)).toEqual({
      isJob: true,
      role: 'Frontend Developer',
      seniority: 'senior',
      skills: ['React', 'TypeScript'],
      salaryMinUsd: 4860,
      salaryMaxUsd: 5940,
      remoteType: 'remote',
      remoteRegions: ['europe', 'eu'],
      lang: 'en',
      summary: { en: 'Builds the checkout.', uk: 'Створює оформлення замовлення.' },
    });
  });

  it('caps skills at 15 and nulls an empty role, unknown salary and bad language', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Skill${i}`);
    const out = normalizeEnrichment({ ...structuredClone(wire), role: ' ', skills: many, salary: null, lang: 'english' } as never);
    expect(out.skills).toHaveLength(15);
    expect(out.role).toBeNull();
    expect(out.salaryMinUsd).toBeNull();
    expect(out.lang).toBeNull();
  });
});

describe('enrichJob', () => {
  it('sends a public request with a truncated description', async () => {
    const llm = new FakeLlmClient(() => wire);
    const res = await enrichJob(llm, input);
    expect(res.enrichment.role).toBe('Frontend Developer');
    expect(res.usage.requests).toBe(1);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.thinking).toBe('low');
    expect(llm.calls[0]!.prompt).toContain('Senior Frontend Developer');
    expect(llm.calls[0]!.prompt).toContain('Acme');
    expect(llm.calls[0]!.prompt.length).toBeLessThan(7_000);
  });

  it('marks missing optional fields in the prompt', () => {
    const prompt = buildEnrichPrompt({ ...input, location: null, salaryRaw: null, tags: [] });
    expect(prompt).toContain('Location: (not stated)');
    expect(prompt).toContain('Salary: (not stated)');
  });
});
