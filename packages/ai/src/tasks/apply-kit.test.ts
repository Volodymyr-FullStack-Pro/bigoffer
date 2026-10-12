import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { generateApplyKit, signOff } from './apply-kit';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Senior Full Stack', company: 'Acme', description: 'React, Node.js, Kubernetes. ' + 'x'.repeat(10_000), salary: '$4000–5000' };

describe('generateApplyKit', () => {
  it('uses the private key, sends CV facts, caps the job text and writes the letter from scratch', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'auto', tone: 'default', salaryMinUsd: 4000 });
    const req = llm.calls[0]!;
    expect(req).toMatchObject({ sensitivity: 'private', task: 'apply_kit', tier: 'writer', thinking: 'low', fallback: 'fast' });
    expect(req.prompt).toContain('Senior Developer at Acme');
    expect(req.prompt).not.toContain('template');
    expect(req.system).toContain('the pitch facts, must-haves first');
    expect(req.system).toContain('Never paraphrase the company');
    expect(req.prompt).toMatch(/<job_posting>[\s\S]*<\/job_posting>/);
    expect(req.system).toContain('untrusted data');
    expect(req.prompt.length).toBeLessThan(12_000);
    expect(kit.requirements).toEqual([{ text: 'React', status: 'met', evidence: 'Built React dashboards at Acme' }, { text: 'Kubernetes', status: 'missing' }]);
    expect(kit.shortMessage.length).toBeLessThanOrEqual(500);
  });

  it('appends a labelled sign-off from the profile, never from the model', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const kit = await generateApplyKit(llm, {
      job,
      cv,
      lang: 'en',
      tone: 'default',
      salaryMinUsd: null,
      candidate: { fullName: 'Jane Doe', contacts: { cv: 'https://cv.example/jane.pdf', phone: '+380500000000', linkedin: 'https://linkedin.com/in/jane' } },
    });
    const req = llm.calls[0]!;
    expect(req.prompt).toContain('Candidate name: Jane Doe');
    expect(req.prompt.indexOf('Candidate name: Jane Doe')).toBeGreaterThan(req.prompt.indexOf('</job_posting>'));
    expect(req.prompt).not.toContain('+380500000000');
    expect(req.system).toContain('Do NOT add a sign-off');
    expect(kit.coverLetter.endsWith('Best regards,\nJane Doe\nPhone: +380500000000\nLinkedIn: https://linkedin.com/in/jane')).toBe(true);
    expect(kit.coverLetter).not.toContain('cv.example');
  });

  it('signs off in the letter language and skips missing details', () => {
    expect(signOff({ fullName: 'Олена', contacts: { email: 'o@x.ua' } }, 'uk')).toBe('З повагою,\nОлена\nEmail: o@x.ua');
    expect(signOff(null, 'en')).toBe('Best regards,');
  });

  it('asks for the chosen language and tone', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await generateApplyKit(llm, { job, cv, lang: 'uk', tone: 'shorter', salaryMinUsd: null });
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.system).toContain('80–100 words');
  });

  it('truncates an over-long short message', async () => {
    const llm = new FakeLlmClient(() => ({ ...(fakeResponder({ task: 'apply_kit' } as never) as object), short_message: 'x'.repeat(800) }), ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(kit.shortMessage).toHaveLength(500);
  });
});
