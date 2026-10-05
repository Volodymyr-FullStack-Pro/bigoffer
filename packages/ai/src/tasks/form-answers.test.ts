import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { answerForm } from './form-answers';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Dev', company: 'Acme', description: 'React', salary: null };

describe('answerForm', () => {
  it('answers every question in order via the private key', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    expect(await answerForm(llm, { questions: ['Kubernetes?', 'Team size?'], job, cv, lang: 'en' })).toEqual(['Fake answer 1', 'Fake answer 2']);
    expect(llm.calls[0]).toMatchObject({ sensitivity: 'private', task: 'form_answers' });
  });
  it('makes no call without questions and fills gaps with empty strings', async () => {
    const none = new FakeLlmClient(fakeResponder, ['private']);
    expect(await answerForm(none, { questions: [], job, cv, lang: 'en' })).toEqual([]);
    expect(none.calls).toHaveLength(0);
    const partial = new FakeLlmClient(() => ({ items: [{ n: 2, answer: 'B' }] }), ['private']);
    expect(await answerForm(partial, { questions: ['a?', 'b?'], job, cv, lang: 'en' })).toEqual(['', 'B']);
  });
});
