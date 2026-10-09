import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { generateApplyKit } from './apply-kit';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Senior Full Stack', company: 'Acme', description: 'React, Node.js, Kubernetes. ' + 'x'.repeat(10_000), salary: '$4000–5000' };

describe('generateApplyKit', () => {
  it('uses the private key, sends CV facts, caps the job text and writes the letter from scratch', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'auto', tone: 'default', salaryMinUsd: 4000 });
    const req = llm.calls[0]!;
    expect(req).toMatchObject({ sensitivity: 'private', task: 'apply_kit' });
    // Writing keeps the model's default thinking.
    expect(req.thinking).toBeUndefined();
    expect(req.prompt).toContain('Senior Developer at Acme');
    expect(req.prompt).not.toContain('template');
    expect(req.system).toContain('from scratch for THIS job');
    expect(req.system).toContain('specific CV fact');
    expect(req.prompt).toMatch(/<job_posting>[\s\S]*<\/job_posting>/);
    expect(req.system).toContain('untrusted data');
    expect(req.system).toContain('never paste the whole CV');
    expect(req.prompt.length).toBeLessThan(12_000);
    expect(kit.requirements).toEqual([{ text: 'React', status: 'met' }, { text: 'Kubernetes', status: 'missing' }]);
    expect(kit.shortMessage.length).toBeLessThanOrEqual(500);
  });

  it('passes the candidate name and contacts for the sign-off', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await generateApplyKit(llm, {
      job,
      cv,
      lang: 'en',
      tone: 'default',
      salaryMinUsd: null,
      candidate: { fullName: 'Jane Doe', contacts: { phone: '+380500000000', linkedin: 'https://linkedin.com/in/jane' } },
    });
    const req = llm.calls[0]!;
    expect(req.prompt).toContain('Full name: Jane Doe');
    expect(req.prompt).toContain('Phone: +380500000000');
    expect(req.prompt).toContain('LinkedIn: https://linkedin.com/in/jane');
    expect(req.prompt).toContain('GitHub: not set');
    // Candidate details sit outside the untrusted job text.
    expect(req.prompt.indexOf('Full name: Jane Doe')).toBeGreaterThan(req.prompt.indexOf('</job_posting>'));
    expect(req.system).toContain('sign-off with the candidate');
    expect(req.system).toContain('no [placeholders]');
    expect(req.system).toContain('untrusted data');
  });

  it('marks every candidate detail as not set without a profile', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await generateApplyKit(llm, { job, cv, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(llm.calls[0]!.prompt).toContain('Full name: not set');
    expect(llm.calls[0]!.prompt).toContain('Email: not set');
  });

  it('asks for the chosen language and tone', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await generateApplyKit(llm, { job, cv, lang: 'uk', tone: 'shorter', salaryMinUsd: null });
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.system).toContain('shorter');
  });

  it('truncates an over-long short message', async () => {
    const llm = new FakeLlmClient(() => ({ ...(fakeResponder({ task: 'apply_kit' } as never) as object), short_message: 'x'.repeat(800) }), ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(kit.shortMessage).toHaveLength(500);
  });
});
