import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { normalizeCv } from './parse-cv';
import { prepLesson, prepPitch, prepPlan, topicKey } from './interview-prep';

const job = { title: 'Full-Stack Developer', company: 'Acme', description: 'React, Node.js, PostgreSQL' };

describe('interview prep', () => {
  it('makes stable topic keys', () => {
    expect(topicKey('React Hooks')).toBe('react-hooks');
    expect(topicKey('C# / .NET')).toBe('c#-net');
    expect(topicKey('  ')).toBe('topic');
  });
  it('plans from the public posting only, with unique topic keys', async () => {
    const llm = new FakeLlmClient(() => ({
      role: 'Dev',
      summary: 'S',
      expectations: ['A', ' '],
      topics: [
        { title: 'React', why: 'w', from_job: true },
        { title: 'React', why: 'w', from_job: false },
      ],
    }));
    const plan = await prepPlan(llm, { job, lang: 'uk' });
    expect(plan.topics.map((t) => t.key)).toEqual(['react', 'react-2']);
    expect(plan.expectations).toEqual(['A']);
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.prompt).toMatch(/<job_posting>[\s\S]*React, Node\.js[\s\S]*<\/job_posting>/);
  });
  it('writes a lesson for a junior with code examples', async () => {
    const llm = new FakeLlmClient(fakeResponder);
    const lesson = await prepLesson(llm, { topic: 'React hooks', why: 'UI', role: 'Dev', lang: 'en' });
    expect(lesson.examples[0]).toMatchObject({ codeLang: 'tsx' });
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.system).toContain('junior');
  });
  it('teaches the middle and senior levels on top of the lower ones', async () => {
    const llm = new FakeLlmClient(fakeResponder);
    const middle = await prepLesson(llm, { topic: 'TypeScript', why: 'UI', role: 'Dev', lang: 'uk', level: 'middle', covered: ['Generics', 'Interfaces'] });
    expect(middle.intro).toContain('[fake middle]');
    expect(llm.calls[0]!.task).toBe('prep_lesson_middle');
    expect(llm.calls[0]!.system).toContain('Level: MIDDLE');
    expect(llm.calls[0]!.system).toContain('utility types');
    expect(llm.calls[0]!.prompt).toMatch(/<covered>\n- Generics\n- Interfaces\n<\/covered>/);
    await prepLesson(llm, { topic: 'TypeScript', why: 'UI', role: 'Dev', lang: 'uk', level: 'senior', covered: ['Generics'] });
    expect(llm.calls[1]!.system).toContain('Level: SENIOR');
    expect(llm.calls[1]!.system).toContain('under the hood');
    await prepLesson(llm, { topic: 'TypeScript', why: 'UI', role: 'Dev', lang: 'uk' });
    expect(llm.calls[2]!.system).toContain('Level: JUNIOR');
    expect(llm.calls[2]!.prompt).not.toContain('<covered>');
  });
  it('builds the pitch from the CV on the private route', async () => {
    const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const pitch = await prepPitch(llm, { job, cv, expectations: ['Build React features'], lang: 'en' });
    expect(pitch.points).toHaveLength(1);
    expect(llm.calls[0]!.sensitivity).toBe('private');
    expect(llm.calls[0]!.prompt).toContain('- Build React features');
    expect(llm.calls[0]!.system).toContain('Never invent experience');
  });
});
