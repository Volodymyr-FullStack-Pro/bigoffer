import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { normalizeCv } from './parse-cv';
import { MESSAGE_LIMITS, recruiterMessage } from './recruiter-message';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const base = { kind: 'intro' as const, job: { title: 'Dev', company: 'Acme', description: null }, cv, recruiterName: 'Anna', lang: 'uk', tone: 'default' as const, previous: [] };

describe('recruiterMessage', () => {
  it('caps the body at the format limit and drops a subject for chat formats', async () => {
    const llm = new FakeLlmClient(() => ({ subject: 'Hello', body: 'x'.repeat(1000) }), ['private']);
    const note = await recruiterMessage(llm, { ...base, format: 'linkedin_note' });
    expect(note.body).toHaveLength(MESSAGE_LIMITS.linkedin_note);
    expect(note.subject).toBeNull();
    const mail = await recruiterMessage(llm, { ...base, format: 'email' });
    expect(mail.subject).toBe('Hello');
    expect(llm.calls[0]!.system).toContain('Ukrainian');
  });
  it('includes earlier messages for a follow-up', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await recruiterMessage(llm, { ...base, format: 'telegram', kind: 'follow_up', previous: ['First ping'] });
    expect(llm.calls[0]!.prompt).toContain('First ping');
    expect(llm.calls[0]!.system).toContain('follow-up');
  });
});
