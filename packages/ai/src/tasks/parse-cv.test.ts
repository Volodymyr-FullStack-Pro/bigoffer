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
