import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { generateApplyKit } from './apply-kit';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Senior Full Stack', company: 'Acme', description: 'React, Node.js, Kubernetes. ' + 'x'.repeat(10_000), salary: '$4000–5000' };

describe('generateApplyKit', () => {
  it('uses the private key, sends CV facts and the template, caps the job text', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const kit = await generateApplyKit(llm, { job, cv, template: 'Hi! [why this job]', lang: 'auto', tone: 'default', salaryMinUsd: 4000 });
    const req = llm.calls[0]!;
    expect(req).toMatchObject({ sensitivity: 'private', task: 'apply_kit' });
    expect(req.prompt).toContain('Senior Developer at Acme');
    expect(req.prompt).toContain('Hi! [why this job]');
    expect(req.prompt.length).toBeLessThan(12_000);
    expect(kit.requirements).toEqual([{ text: 'React', status: 'met' }, { text: 'Kubernetes', status: 'missing' }]);
    expect(kit.shortMessage.length).toBeLessThanOrEqual(500);
  });

  it('asks for the chosen language and tone', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await generateApplyKit(llm, { job, cv, template: null, lang: 'uk', tone: 'shorter', salaryMinUsd: null });
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.system).toContain('shorter');
  });

  it('truncates an over-long short message', async () => {
    const llm = new FakeLlmClient(() => ({ ...(fakeResponder({ task: 'apply_kit' } as never) as object), short_message: 'x'.repeat(800) }), ['private']);
    const kit = await generateApplyKit(llm, { job, cv, template: null, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(kit.shortMessage).toHaveLength(500);
  });
});
