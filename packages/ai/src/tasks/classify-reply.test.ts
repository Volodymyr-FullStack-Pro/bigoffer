import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { classifyReply } from './classify-reply';

const input = { text: 'Hi! Pick a slot: calendly.com/x', job: { title: 'Dev', company: 'Acme' }, lang: 'uk', timeZone: 'Europe/Kyiv', now: new Date('2026-10-13T09:00:00Z') };

describe('classifyReply', () => {
  it('returns the kind, a valid local interview time and a trimmed summary', async () => {
    const llm = new FakeLlmClient(() => ({ kind: 'interview_invite', interview_at: '2026-10-20T12:30', summary: ` ${'x'.repeat(300)} `, recruiter_name: ' Galina ', rejection_stage: null, rejection_reasons: [] }), ['private']);
    const res = await classifyReply(llm, input);
    expect(res).toEqual({ kind: 'interview_invite', interviewAt: '2026-10-20T12:30', summary: 'x'.repeat(200), recruiterName: 'Galina', rejection: null });
    expect(llm.calls[0]!.sensitivity).toBe('private');
    expect(llm.calls[0]!.system).toContain('2026-10-13T12:00');
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.prompt).toMatch(/<reply>[\s\S]*calendly[\s\S]*<\/reply>/);
  });

  it('drops an interview time that is not a local date-time', async () => {
    const llm = new FakeLlmClient(() => ({ kind: 'auto_reply', interview_at: 'next week', summary: 'Got it', recruiter_name: null, rejection_stage: null, rejection_reasons: [] }), ['private']);
    expect((await classifyReply(llm, input)).interviewAt).toBeNull();
  });

  it('suggests the rejection stage and reasons, never the candidate\'s own', async () => {
    const llm = new FakeLlmClient(() => ({ kind: 'rejection', interview_at: null, summary: 'No', recruiter_name: null, rejection_stage: 'application', rejection_reasons: ['other_candidate', 'other_candidate', 'my_decision_salary'] }), ['private']);
    expect((await classifyReply(llm, input)).rejection).toEqual({ stage: 'application', reasons: ['other_candidate'] });
  });
  it('counts an invite that asks to confirm a slot as an interview, not a question', async () => {
    const llm = new FakeLlmClient(() => ({ kind: 'interview_invite', interview_at: null, summary: 'Call', recruiter_name: null, rejection_stage: null, rejection_reasons: [] }), ['private']);
    await classifyReply(llm, input);
    expect(llm.calls[0]!.system).toContain('It wins over question when the message invites to a call');
    expect(llm.calls[0]!.system).toContain('proposes or confirms one specific interview date');
  });
});
