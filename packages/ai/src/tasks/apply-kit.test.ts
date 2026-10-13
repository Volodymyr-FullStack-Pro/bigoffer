import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { formatLetter, generateApplyKit, signOff } from './apply-kit';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Senior Full Stack', company: 'Acme', description: 'React, Node.js, Kubernetes. ' + 'x'.repeat(10_000), salary: '$4000–5000' };

describe('generateApplyKit', () => {
  it('uses the private key, sends CV facts, caps the job text and writes the letter from scratch', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'auto', tone: 'default', salaryMinUsd: 4000 });
    const req = llm.calls[0]!;
    expect(req).toMatchObject({ sensitivity: 'private', task: 'apply_kit', tier: 'writer', thinking: 'low', fallback: 'fast' });
    // The letter is its own short brief with the model's own thinking.
    const letter = llm.calls.find((c) => c.task === 'cover_letter')!;
    expect(letter).toMatchObject({ sensitivity: 'private', tier: 'writer' });
    expect(letter.thinking).toBeUndefined();
    expect(letter.system).toContain('never mention missing skills');
    expect(letter.prompt).toBe(req.prompt);
    expect(req.prompt).toContain('Senior Developer at Acme');
    expect(req.prompt).not.toContain('template');
    expect(req.system).toContain('The cover letter is written separately');
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
    expect(llm.calls.find((c) => c.task === 'cover_letter')!.system).toContain('no sign-off');
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
    const letter = llm.calls.find((c) => c.task === 'cover_letter')!;
    expect(letter.system).toContain('Ukrainian');
    expect(letter.system).toContain('80–100 words');
  });

  it('truncates an over-long short message', async () => {
    const llm = new FakeLlmClient(() => ({ ...(fakeResponder({ task: 'apply_kit' } as never) as object), short_message: 'x'.repeat(800) }), ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(kit.shortMessage).toHaveLength(500);
  });
});

describe('formatLetter', () => {
  it('lays out a letter that came back as one line', () => {
    const flat =
      'Dear Binary Studio Team, I am excited to apply. Why I am a strong fit: • Stack match: React and NestJS. • Ownership: sole developer on Contrify. Feel free to reach out — I would be glad to tell you more.';
    expect(formatLetter(flat)).toBe(
      'Dear Binary Studio Team,\n\nI am excited to apply. Why I am a strong fit:\n\n• Stack match: React and NestJS.\n• Ownership: sole developer on Contrify.\n\nFeel free to reach out — I would be glad to tell you more.',
    );
  });

  it('leaves a well-formed letter as it is', () => {
    const good = 'Hi Acme team,\n\nOpening.\n\nWhy I fit:\n\n• One.\n• Two.\n\nFeel free to reach out.';
    expect(formatLetter(good)).toBe(good);
  });

  it('formats Ukrainian too', () => {
    expect(formatLetter('Добрий день, команда Acme! Маю 3+ роки досвіду: • React. • NestJS. Буду радий поспілкуватися.')).toBe(
      'Добрий день, команда Acme!\n\nМаю 3+ роки досвіду:\n\n• React.\n• NestJS.\n\nБуду радий поспілкуватися.',
    );
  });
});

describe('generateApplyKit retries', () => {
  it('tries a failed request once more before giving up', async () => {
    let letterCalls = 0;
    const llm = new FakeLlmClient((req) => {
      if (req.task === 'cover_letter' && letterCalls++ === 0) throw new Error('cut off');
      return fakeResponder(req);
    }, ['private']);
    const kit = await generateApplyKit(llm, { job, cv, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(kit.coverLetter).toContain('[fake]');
    expect(llm.calls.filter((c) => c.task === 'cover_letter')).toHaveLength(2);
  });
});
