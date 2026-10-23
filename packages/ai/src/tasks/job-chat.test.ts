import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { jobChat } from './job-chat';

describe('jobChat', () => {
  it('answers with the posting, the CV and the last turns, on the private model', async () => {
    const llm = new FakeLlmClient(() => ({ answer: '  Brush up on GraphQL.  ' }), ['private']);
    const history = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `turn ${i}` }));
    const out = await jobChat(llm, { job: { title: 'Frontend', company: 'Acme', description: 'React, GraphQL', salary: null }, cv: null, history, question: 'What should I learn?' });
    expect(out).toBe('Brush up on GraphQL.');
    const req = llm.calls[0]!;
    expect(req.sensitivity).toBe('private');
    expect(req.prompt).toContain('turn 11');
    expect(req.prompt).not.toContain('turn 3');
    expect(req.prompt).toContain('Candidate: What should I learn?');
  });
});
