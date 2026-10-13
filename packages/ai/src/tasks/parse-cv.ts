import { SENIORITIES, type Seniority } from '@jp/core';
import { z } from 'zod';
import type { LlmClient } from '../types';

const nullableText = z.string().nullable();

export const cvWireSchema = z.object({
  full_name: nullableText,
  headline: nullableText.describe('Main role in English, e.g. "Full Stack Developer"'),
  seniority: z.enum(SENIORITIES).nullable(),
  years_experience: z.number().nullable(),
  skills: z.array(z.string()).describe('Every concrete skill, tool, library, service and integration the CV lists (up to 60), canonical names'),
  locations: z.array(z.string()).describe('Cities/countries the candidate lives in or wants to work in'),
  languages: z.array(z.object({ language: z.string(), level: z.string() })),
  remote_preference: z.enum(['any', 'remote', 'hybrid', 'office']),
  summary: nullableText.describe('Two sentences in English'),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      start: nullableText,
      end: nullableText,
      highlights: z
        .array(z.string())
        .describe('Every bullet of this role copied verbatim with its details and numbers, including bullets of projects done there ("Park-It: ...")'),
    }),
  ),
  contacts: z.object({ email: nullableText, phone: nullableText, linkedin: nullableText, github: nullableText, portfolio: nullableText, telegram: nullableText }),
});

const contact = z.object({
  email: z.email().nullable(),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/).nullable(),
  linkedin: z.url({ protocol: /^https?$/ }).nullable(),
  github: z.url({ protocol: /^https?$/ }).nullable(),
  portfolio: z.url({ protocol: /^https?$/ }).nullable(),
  telegram: z.string().regex(/^@?[A-Za-z0-9_]{5,32}$/).nullable(),
});

/** Validated shape stored in resumes.parsed (also used to read it back). */
export const parsedCvSchema = z.object({
  fullName: z.string().nullable(),
  headline: z.string().nullable(),
  seniority: z.enum(SENIORITIES).nullable(),
  yearsExperience: z.number().nullable(),
  skills: z.array(z.string()),
  locations: z.array(z.string()),
  languages: z.array(z.object({ language: z.string(), level: z.string() })),
  remotePreference: z.enum(['any', 'remote', 'hybrid', 'office']),
  summary: z.string().nullable(),
  experience: z.array(z.object({ company: z.string(), title: z.string(), start: z.string().nullable(), end: z.string().nullable(), highlights: z.array(z.string()) })),
  contacts: contact,
});
export type ParsedCv = z.infer<typeof parsedCvSchema>;

const MAX_HIGHLIGHT = 400;

const clip = (s: string | null, n: number) => {
  const t = s?.trim() ?? '';
  return t ? t.slice(0, n) : null;
};
function dedupe(values: string[], max: number, len: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || t.length > len || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
const valid = <T>(schema: z.ZodType<T>, v: unknown): T | null => {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

export function normalizeCv(w: z.output<typeof cvWireSchema>): ParsedCv {
  const years = w.years_experience != null && w.years_experience >= 0 && w.years_experience <= 60 ? Math.round(w.years_experience) : null;
  return {
    fullName: clip(w.full_name, 120),
    headline: clip(w.headline, 80),
    seniority: w.seniority,
    yearsExperience: years,
    // All of them: a long skills section (45+ on a full-stack CV) feeds matching and the search profile.
    skills: dedupe(w.skills, 60, 40),
    locations: dedupe(w.locations, 10, 60),
    languages: w.languages.slice(0, 8).map((l) => ({ language: l.language.trim().slice(0, 40), level: l.level.trim().slice(0, 20) })).filter((l) => l.language),
    remotePreference: w.remote_preference,
    summary: clip(w.summary, 400),
    experience: w.experience.slice(0, 8).map((e) => ({
      company: e.company.trim().slice(0, 120),
      title: e.title.trim().slice(0, 120),
      start: clip(e.start, 20),
      end: clip(e.end, 20),
      // Letters and answers are built from these: keep every bullet with its details, cut a long one instead of dropping it.
      highlights: dedupe(e.highlights.map((h) => h.trim().slice(0, MAX_HIGHLIGHT)), 12, MAX_HIGHLIGHT),
    })),
    contacts: {
      email: valid(z.email(), w.contacts.email?.trim()),
      phone: valid(contact.shape.phone.unwrap(), w.contacts.phone?.trim()),
      linkedin: valid(z.url({ protocol: /^https?$/ }), w.contacts.linkedin?.trim()),
      github: valid(z.url({ protocol: /^https?$/ }), w.contacts.github?.trim()),
      portfolio: valid(z.url({ protocol: /^https?$/ }), w.contacts.portfolio?.trim()),
      telegram: valid(contact.shape.telegram.unwrap(), w.contacts.telegram?.trim()),
    },
  };
}

const SYSTEM = [
  'You read one CV (PDF) and extract structured facts for a job search app.',
  'Use only what the CV states. Never invent employers, dates, skills or contacts.',
  'Skills: concrete technologies, tools and professional skills, canonical names.',
].join('\n');

/** The CV read gets 2 minutes (the default request timeout is 60 s); the web route's maxDuration must exceed it. */
export const PARSE_CV_TIMEOUT_MS = 120_000;

/** The PDF's text layer; empty for a scanned CV or an unreadable file. */
export async function pdfText(pdfBase64: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(pdfBase64, 'base64')));
    const { text } = await extractText(pdf, { mergePages: true });
    // Contacts are often links behind a word ("LinkedIn", "GitHub"): the URLs live in the link annotations.
    const links = new Set<string>();
    for (let n = 1; n <= Math.min(pdf.numPages, 5); n++) {
      const page = await pdf.getPage(n);
      for (const a of (await page.getAnnotations()) as { url?: string }[]) if (a.url && /^(https?:|mailto:)/i.test(a.url)) links.add(a.url);
    }
    const body = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return links.size > 0 ? `${body}\n\nLinks in the PDF:\n${[...links].slice(0, 20).join('\n')}` : body;
  } catch {
    return '';
  }
}

/** Below this the PDF is probably a scan: its text layer is too thin to parse from. */
const MIN_TEXT = 400;

/**
 * A CV with a text layer is parsed from its text by the writing model (seconds; the Gemini PDF read took 90 s and
 * timed out, Oct 2026); a scan, or a failure there, goes to the PDF reader as before.
 */
export async function parseCv(llm: LlmClient, input: { pdfBase64: string }): Promise<ParsedCv> {
  const text = await pdfText(input.pdfBase64);
  if (text.length >= MIN_TEXT) {
    try {
      const res = await llm.generateJson({
        sensitivity: 'private',
        tier: 'writer',
        task: 'parse_cv',
        schema: cvWireSchema,
        system: SYSTEM,
        prompt: `Extract the facts from this CV (its PDF text; columns may be interleaved):\n<cv>\n${text.slice(0, 20_000)}\n</cv>`,
        maxOutputTokens: 8000,
        timeoutMs: 60_000,
      });
      return normalizeCv(res.data);
    } catch (err) {
      console.error('parseCv: text parse failed, reading the PDF instead', err instanceof Error ? err.name : 'unknown');
    }
  }
  const res = await llm.generateJson({
    sensitivity: 'private',
    task: 'parse_cv',
    schema: cvWireSchema,
    system: SYSTEM,
    prompt: 'Extract the facts from the attached CV.',
    files: [{ mimeType: 'application/pdf', dataBase64: input.pdfBase64 }],
    // A long CV's JSON needs room; extraction needs little thinking, and a PDF read can take over a minute.
    maxOutputTokens: 8000,
    thinking: 'low',
    timeoutMs: PARSE_CV_TIMEOUT_MS,
  });
  return normalizeCv(res.data);
}

/** Compact CV text for other prompts (private only). */
export function cvToPrompt(cv: ParsedCv): string {
  const lines = [
    `Role: ${cv.headline ?? 'n/a'}${cv.seniority ? ` (${cv.seniority})` : ''}${cv.yearsExperience != null ? `, ${cv.yearsExperience} years` : ''}`,
    `Skills: ${cv.skills.join(', ') || 'n/a'}`,
    `Languages: ${cv.languages.map((l) => `${l.language} ${l.level}`).join(', ') || 'n/a'}`,
    `Location: ${cv.locations.join(', ') || 'n/a'}; prefers ${cv.remotePreference}`,
    `Summary: ${cv.summary ?? 'n/a'}`,
    'Experience:',
    ...cv.experience.flatMap((e) => [`- ${e.title} at ${e.company} (${e.start ?? '?'}–${e.end ?? 'now'}):`, ...e.highlights.map((h) => `  • ${h}`)]),
  ];
  return lines.join('\n').slice(0, 10_000);
}

export function searchProfileFromCv(cv: ParsedCv) {
  const role = cv.headline ?? 'Developer';
  return {
    name: role.slice(0, 80),
    keywords: [role.toLowerCase().slice(0, 60)],
    skills: cv.skills.slice(0, 60),
    seniority: (cv.seniority ? [cv.seniority] : []) as Seniority[],
    locations: cv.locations.slice(0, 10).map((l) => l.slice(0, 60)),
    remoteType: cv.remotePreference,
  };
}
