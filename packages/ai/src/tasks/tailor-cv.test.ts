import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import type { ParsedCv } from './parse-cv';
import { tailorCv } from './tailor-cv';

const cv: ParsedCv = {
  fullName: 'Olena Koval',
  headline: 'Frontend Developer',
  seniority: 'middle',
  yearsExperience: 4,
  skills: ['React', 'TypeScript', 'Next.js'],
  locations: ['Kyiv'],
  languages: [{ language: 'English', level: 'B2' }],
  remotePreference: 'remote',
  summary: null,
  experience: [
    { company: 'Brightlane', title: 'Frontend Developer', start: '2021', end: null, highlights: ['Built a design system in React'] },
    { company: 'Northwind', title: 'Junior Developer', start: '2019', end: '2021', highlights: ['Fixed bugs'] },
  ],
  contacts: { email: null, phone: null, linkedin: null, github: null, portfolio: null, telegram: null },
};

describe('tailorCv', () => {
  it('keeps employers, titles and dates from the CV and marks skills the CV lacks', async () => {
    const llm = new FakeLlmClient(
      () => ({
        lang: 'en',
        headline: 'Middle Frontend Engineer',
        summary: 'Frontend engineer with 4 years of React.',
        skills: ['TypeScript', 'React', 'GraphQL', 'react'],
        experience: [{ index: 0, bullets: [{ text: 'Led the design system used by 4 teams', change: 'reworded' }, { text: 'Built GraphQL APIs', change: 'unverified' }] }],
      }),
      ['private'],
    );
    const out = await tailorCv(llm, { job: { title: 'Frontend Engineer', company: 'Acme', description: 'React, GraphQL', salary: null }, cv, lang: 'auto' });
    expect(out.headline).toBe('Middle Frontend Engineer');
    expect(out.skills).toEqual([
      { name: 'TypeScript', inProfile: true },
      { name: 'React', inProfile: true },
      { name: 'GraphQL', inProfile: false },
    ]);
    expect(out.experience[0]).toMatchObject({ company: 'Brightlane', title: 'Frontend Developer', start: '2021', end: null });
    expect(out.experience[0]!.bullets.map((b) => b.change)).toEqual(['reworded', 'unverified']);
    // A role the model skipped keeps its own bullets, unchanged.
    expect(out.experience[1]).toMatchObject({ company: 'Northwind', bullets: [{ text: 'Fixed bugs', change: 'same' }] });
    expect(llm.calls[0]!.sensitivity).toBe('private');
  });
});
