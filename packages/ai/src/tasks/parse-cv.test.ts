import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { cvToPrompt, normalizeCv, parseCv, searchProfileFromCv } from './parse-cv';

describe('parseCv', () => {
  it('sends the PDF with the private key and normalizes the result', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const cv = await parseCv(llm, { pdfBase64: 'JVBERi0=' });
    expect(llm.calls[0]).toMatchObject({ sensitivity: 'private', task: 'parse_cv', files: [{ mimeType: 'application/pdf', dataBase64: 'JVBERi0=' }] });
    // Low thinking, a 2-minute timeout and room for a long CV's JSON (a thinking model timed out at 60 s).
    expect(llm.calls[0]).toMatchObject({ thinking: 'low', timeoutMs: 120_000, maxOutputTokens: 8000 });
    expect(cv.headline).toBe('Full Stack Developer');
    expect(cv.contacts.linkedin).toBe('https://www.linkedin.com/in/test-user');
  });

  it('refuses without a private key', async () => {
    await expect(parseCv(new FakeLlmClient(fakeResponder, ['public']), { pdfBase64: 'x' })).rejects.toThrow(/private/);
  });

  it('drops invalid contacts and caps lists', () => {
    const w = fakeResponder({ task: 'parse_cv' } as never) as Parameters<typeof normalizeCv>[0];
    const cv = normalizeCv({ ...w, skills: Array.from({ length: 70 }, (_, i) => `S${i}`), contacts: { ...w.contacts, email: 'nope', github: 'javascript:alert(1)' } });
    expect(cv.skills).toHaveLength(60);
    expect(cv.contacts.email).toBeNull();
    expect(cv.contacts.github).toBeNull();
  });

  it('builds prompt text and a search profile', () => {
    const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
    expect(cvToPrompt(cv)).toContain('Senior Developer at Acme');
    expect(searchProfileFromCv(cv)).toEqual({
      name: 'Full Stack Developer',
      keywords: ['full stack developer'],
      skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      seniority: ['senior'],
      locations: ['Kyiv'],
      remoteType: 'remote',
    });
  });
});

describe('mainSkills', () => {
  it('drops a core stack the CV names once in passing and keeps the ones it works in', async () => {
    const { mainSkills } = await import('./parse-cv');
    const cv = {
      ...normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never),
      headline: 'Full-Stack Software Engineer',
      summary: 'Ships TypeScript, React and Node.js apps.',
      skills: ['TypeScript', 'React', 'PHP', 'Laravel', 'Go', 'Python', 'Docker'],
      experience: [
        { company: 'MOAR', title: 'Full-Stack Engineer', start: '2024', end: '2024', highlights: ['Features across React and NestJS, Go and PHP/Laravel backends'] },
        { company: 'Data Co', title: 'Python Developer', start: '2020', end: '2022', highlights: ['ETL in Python'] },
        { company: 'Py Lab', title: 'Engineer', start: '2019', end: '2020', highlights: ['Django services'] },
      ],
    };
    expect(mainSkills(cv)).toEqual(['TypeScript', 'React', 'Python', 'Docker']);
    expect(mainSkills({ ...cv, summary: 'PHP and React developer' })).toContain('Laravel');
  });
});

describe('CV detail kept for letters', () => {
  it('keeps up to 12 bullets per role and cuts a long one instead of dropping it', async () => {
    const { normalizeCv, cvToPrompt } = await import('./parse-cv');
    const long = `Park-It: Implemented complex booking calculation logic (pricing, durations, availability) ${'x'.repeat(500)}`;
    const bullets = [long, ...Array.from({ length: 14 }, (_, i) => `Bullet ${i}`)];
    const cv = normalizeCv({
      full_name: 'A', headline: 'Dev', seniority: null, years_experience: 3, skills: [], locations: [], languages: [],
      remote_preference: 'any', summary: null,
      experience: [{ company: 'Arctic Web', title: 'Engineer', start: null, end: null, highlights: bullets }],
      contacts: { email: null, phone: null, linkedin: null, github: null, portfolio: null, telegram: null },
    });
    const h = cv.experience[0]!.highlights;
    expect(h).toHaveLength(12);
    expect(h[0]).toMatch(/^Park-It: Implemented complex booking calculation logic \(pricing, durations, availability\)/);
    expect(h[0]!.length).toBe(400);
    expect(cvToPrompt(cv)).toContain('  • Bullet 10');
  });
});

describe('levelsForYears', () => {
  it('picks the level reached and its neighbour', async () => {
    const { levelsForYears } = await import('./parse-cv');
    expect(levelsForYears(null)).toEqual([]);
    expect(levelsForYears(0)).toEqual(['intern', 'junior']);
    expect(levelsForYears(3)).toEqual(['junior', 'middle']);
    expect(levelsForYears(6)).toEqual(['middle', 'senior']);
    expect(levelsForYears(10)).toEqual(['senior', 'lead']);
  });
});
