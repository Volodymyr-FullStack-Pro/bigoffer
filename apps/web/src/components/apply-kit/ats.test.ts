import type { ParsedCv, TailoredCv } from '@jp/ai';
import { describe, expect, it } from 'vitest';
import { atsScore } from './ats';

const cv = { headline: 'Frontend Developer', summary: null, skills: ['React', 'TypeScript'], experience: [{ company: 'A', title: 'Dev', start: null, end: null, highlights: ['Built dashboards in Next.js'] }] } as unknown as ParsedCv;
const tailored = {
  headline: 'Frontend Engineer',
  summary: 'React and Node.js engineer.',
  skills: [{ name: 'React', inProfile: true }, { name: 'TypeScript', inProfile: true }, { name: 'Next.js', inProfile: true }],
  experience: [{ company: 'A', title: 'Dev', start: null, end: null, bullets: [{ text: 'Built REST APIs in Node.js', change: 'reworded' }] }],
} as unknown as TailoredCv;

describe('atsScore', () => {
  it('counts the job keywords each CV names and lists the missing ones', () => {
    expect(atsScore(['React', 'Next.js', 'Node.js', 'GraphQL', 'react'], cv, tailored)).toEqual({ before: 2, after: 3, total: 4, missing: ['GraphQL'] });
  });
});
