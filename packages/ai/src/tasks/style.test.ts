import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { answerForm } from './form-answers';
import { normalizeCv } from './parse-cv';
import { bannedPhrases } from './style';

describe('bannedPhrases', () => {
  it('finds marketing and cliché phrases', () => {
    expect(bannedPhrases('Your next-generation system aligns closely with my skills.')).toEqual(['next-generation', 'aligns closely with']);
    expect(bannedPhrases('I built Stripe payments at Acme.')).toEqual([]);
  });
});

describe('rewrite on a banned phrase', () => {
  it('asks once more, naming the phrase, and keeps the clean answer', async () => {
    const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
    const answers = [{ items: [{ n: 1, answer: 'Your world-class team.' }] }, { items: [{ n: 1, answer: 'I built payments at Acme.' }] }];
    const llm = new FakeLlmClient(() => answers.shift()!, ['private']);
    const out = await answerForm(llm, { questions: ['Why us?'], job: { title: 'Dev', company: 'Acme', description: 'x', salary: null }, cv, lang: 'en' });
    expect(out).toEqual(['I built payments at Acme.']);
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!.prompt).toContain('"world-class"');
  });
});
