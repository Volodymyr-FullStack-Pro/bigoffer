/** Tag a board stores with a job when it states the years outside the text (Djinni's JSON-LD monthsOfExperience). */
export const YEARS_TAG = 'years:';

/** Years of experience a posting asks for, if it states one (en / uk / ru). */
// A range ("2-4", "4-10+") counts as its lower bound: the second number is part of the match, not captured.
const NUM = String.raw`(\d{1,2})(?:[.,]\d)?\s*\+?\s*(?:(?:-|–|—|to|до)\s*\d{1,2}\s*\+?\s*)?`;
const PATTERNS: RegExp[] = [
  // "3+ years of (commercial) experience", "5 years' experience", "2-3 yrs exp"
  new RegExp(String.raw`${NUM}(?:years?|yrs?)['’]?\s+(?:of\s+)?(?:[\p{L}/-]+\s+){0,4}?(?:experience|exp\b)`, 'giu'),
  // "3+ years of React", "4 years with TypeScript", "2+ years in frontend" (a requirement phrasing on its own)
  new RegExp(String.raw`${NUM}(?:years?|yrs?)\s+(?:of|with|in)\s+(?!the\b|a\b|business\b|market\b)`, 'giu'),
  // "experience: 3+ years", "at least 4 years in", "minimum of 2 years"
  new RegExp(String.raw`(?:experience|at least|minimum(?: of)?)[^\d\n.]{0,30}?${NUM}(?:years?|yrs?)`, 'giu'),
  // uk / ru: "досвід від 3 років", "від 2-х років досвіду", "опыт от 3 лет", "3+ роки досвіду"
  new RegExp(String.raw`(?:досвід\p{L}*|опыт\p{L}*)[^\d\n.]{0,30}?${NUM}(?:-?х\s*)?(?:рок\p{L}*|рік|лет|год\p{L}*)`, 'giu'),
  new RegExp(String.raw`${NUM}(?:-?х\s*)?(?:рок\p{L}*|рік|лет|год\p{L}*)\s+(?:[\p{L}]+\s+){0,3}?(?:досвід\p{L}*|опыт\p{L}*)`, 'giu'),
];

/**
 * The largest years-of-experience requirement stated in the text (the headline one: "3+ years of React and 1 year of
 * Node" → 3), or null. Only numbers next to an experience word count, so "20 years on the market" is ignored; values
 * above 15 are treated as noise.
 */
export function requiredYears(raw: string, tags: readonly string[] = []): number | null {
  const tagged = tags.find((t) => t.startsWith(YEARS_TAG));
  if (tagged) {
    const n = Number(tagged.slice(YEARS_TAG.length));
    if (Number.isFinite(n) && n >= 1 && n <= 15) return n;
  }
  // "between 2 years and 6 years" / "from 3 to 5 years" → the lower bound.
  const text = raw.replace(/\b(?:between|from)\s+(\d{1,2})\s*(?:years?|yrs?)?\s+(?:and|to)\s+\d{1,2}\b/giu, '$1');
  let best: number | null = null;
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 15 && (best === null || n > best)) best = n;
    }
  }
  return best;
}
