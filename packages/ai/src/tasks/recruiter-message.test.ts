import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { normalizeCv } from './parse-cv';
import { MESSAGE_LIMITS, recruiterMessage, REPLY_LIMIT } from './recruiter-message';

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
    expect(llm.calls[0]!.prompt).toMatch(/<job_posting>[\s\S]*<\/job_posting>/);
    expect(llm.calls[0]!.system).toContain('untrusted data');
    expect(llm.calls[0]!.system).toContain('never paste the whole CV');
  });
  it('introduces the candidate by name, or by role when the name is unknown', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await recruiterMessage(llm, { ...base, format: 'inmail', candidateName: 'Volodymyr Babiichuk' });
    expect(llm.calls[0]!.prompt).toContain('Candidate name: Volodymyr Babiichuk');
    expect(llm.calls[0]!.system).toContain('sign off with the name');
    await recruiterMessage(llm, { ...base, format: 'inmail' });
    expect(llm.calls[1]!.system).toContain('never "My name is" without a name');
  });
  it('replies to the latest recruiter message with the thread, in their language, without a subject', async () => {
    const llm = new FakeLlmClient(() => ({ subject: 'Re', body: 'y'.repeat(3000) }), ['private']);
    const res = await recruiterMessage(llm, {
      ...base,
      format: 'email',
      kind: 'reply',
      lang: 'auto',
      channel: 'email',
      thread: [
        { direction: 'out', author: null, body: 'My application' },
        { direction: 'in', author: 'Alina', body: 'Are you free tomorrow at 18:00?' },
      ],
    });
    expect(res.subject).toBeNull();
    expect(res.body).toHaveLength(REPLY_LIMIT);
    const call = llm.calls[0]!;
    expect(call.prompt).toMatch(/<conversation>[\s\S]*Candidate: My application[\s\S]*Recruiter \(Alina\): Are you free tomorrow at 18:00\?[\s\S]*<\/conversation>/);
    expect(call.system).toContain("the same language as the recruiter's latest message");
    expect(call.system).toContain('confirm it by restating the day and time');
    expect(call.system).not.toContain('first message');
  });
  it("follows the candidate's note over the defaults", async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await recruiterMessage(llm, { ...base, format: 'email', kind: 'reply', lang: 'auto', thread: [{ direction: 'in', author: null, body: 'Please fill in the form' }], note: 'I already filled in the form' });
    expect(llm.calls[0]!.prompt).toMatch(/<candidate_note>\nI already filled in the form\n<\/candidate_note>/);
    expect(llm.calls[0]!.system).toContain('it overrides the defaults');
    await recruiterMessage(llm, { ...base, format: 'email' });
    expect(llm.calls[1]!.prompt).not.toContain('<candidate_note>');
  });
});
