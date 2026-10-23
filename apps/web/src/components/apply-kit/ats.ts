import type { ParsedCv, TailoredCv } from '@jp/ai';
import { skillKeys } from '@/app/[locale]/(app)/today/card-skills';

export type AtsScore = { before: number; after: number; total: number; missing: string[] };

const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9#+.]+/).flatMap((w) => skillKeys(w)));

/** How many of the job's technologies a CV names anywhere (skills, bullets, summary), as an ATS keyword scan would. */
function covered(keywords: readonly string[], skills: readonly string[], text: string): Set<string> {
  const have = new Set([...skills.flatMap(skillKeys), ...words(text)]);
  const lower = text.toLowerCase();
  return new Set(keywords.filter((k) => skillKeys(k).some((key) => have.has(key)) || lower.includes(k.toLowerCase())));
}

/** The job's keywords found in the original CV and in the one written for the job, and what is still missing. */
export function atsScore(keywords: readonly string[], cv: ParsedCv, tailored: TailoredCv): AtsScore {
  const list = [...new Map(keywords.map((k) => [k.toLowerCase(), k])).values()].slice(0, 30);
  const original = covered(list, cv.skills, [cv.headline, cv.summary, ...cv.experience.flatMap((e) => [e.title, ...e.highlights])].join(' '));
  const after = covered(
    list,
    tailored.skills.map((s) => s.name),
    [tailored.headline, tailored.summary, ...tailored.experience.flatMap((e) => [e.title, ...e.bullets.map((b) => b.text)])].join(' '),
  );
  return { before: original.size, after: after.size, total: list.length, missing: list.filter((k) => !after.has(k)) };
}
