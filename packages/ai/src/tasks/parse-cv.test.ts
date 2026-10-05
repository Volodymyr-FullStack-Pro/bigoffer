import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { cvToPrompt, normalizeCv, parseCv, searchProfileFromCv } from './parse-cv';

describe('parseCv', () => {
  it('sends the PDF with the private key and normalizes the result', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const cv = await parseCv(llm, { pdfBase64: 'JVBERi0=' });
    expect(llm.calls[0]).toMatchObject({ sensitivity: 'private', task: 'parse_cv', files: [{ mimeType: 'application/pdf', dataBase64: 'JVBERi0=' }] });
    expect(cv.headline).toBe('Full Stack Developer');
    expect(cv.contacts.linkedin).toBe('https://www.linkedin.com/in/test-user');
  });

  it('refuses without a private key', async () => {
    await expect(parseCv(new FakeLlmClient(fakeResponder, ['public']), { pdfBase64: 'x' })).rejects.toThrow(/private/);
  });

  it('drops invalid contacts and caps lists', () => {
    const w = fakeResponder({ task: 'parse_cv' } as never) as Parameters<typeof normalizeCv>[0];
    const cv = normalizeCv({ ...w, skills: Array.from({ length: 40 }, (_, i) => `S${i}`), contacts: { ...w.contacts, email: 'nope', github: 'javascript:alert(1)' } });
    expect(cv.skills).toHaveLength(30);
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
