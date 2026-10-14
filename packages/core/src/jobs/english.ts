/** CEFR levels, lowest first; "none" = the posting says no English is needed. */
export const ENGLISH_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type EnglishLevel = (typeof ENGLISH_LEVELS)[number];

/** Tag a board stores with a job when it states the level outside the text (Djinni lists show "Англійська - C1"). */
export const ENGLISH_TAG = 'english:';

const WORDS: [RegExp, EnglishLevel][] = [
  [/\b(?:native|bilingual|proficient|proficiency)\b/i, 'C2'],
  [/\b(?:advanced|fluent|fluency)\b/i, 'C1'],
  [/\bupper[\s-]?intermediate\b/i, 'B2'],
  [/\bpre[\s-]?intermediate\b/i, 'A2'],
  [/\bintermediate\b/i, 'B1'],
  [/\b(?:elementary|beginner)\b/i, 'A1'],
];

const rank = (l: EnglishLevel) => ENGLISH_LEVELS.indexOf(l);

/** A CEFR code or level word in a short phrase ("B2+", "Upper-Intermediate", "C1 - Advanced"), or null. */
export function englishLevelOf(phrase: string): EnglishLevel | null {
  const code = /\b([ABC][12])\b/i.exec(phrase)?.[1]?.toUpperCase() as EnglishLevel | undefined;
  if (code && ENGLISH_LEVELS.includes(code)) return code;
  for (const [re, level] of WORDS) if (re.test(phrase)) return level;
  return null;
}

/**
 * The English level a job asks for: a board tag first, else a phrase in the text that mentions English (en / uk / ru)
 * next to a level ("Upper-Intermediate English", "English: B2+", "англійська B1"). Null when not stated.
 */
export function requiredEnglish(text: string, tags: readonly string[] = []): EnglishLevel | null {
  const tag = tags.find((t) => t.startsWith(ENGLISH_TAG));
  if (tag) return englishLevelOf(tag.slice(ENGLISH_TAG.length));
  let best: EnglishLevel | null = null;
  const near = /(?:english|англ\p{L}*)[^\n.;]{0,40}|[^\n.;]{0,40}(?:english|англ\p{L}*)/giu;
  for (const m of text.matchAll(near)) {
    // "Advanced knowledge of Git" is not about English: the level word must sit in the English phrase itself.
    const level = englishLevelOf(m[0]);
    if (level && (best === null || rank(level) > rank(best))) best = level;
  }
  return best;
}

/** The candidate's English from the CV languages ("English", "B2" / "Upper-Intermediate"), or null. */
export function candidateEnglish(languages: readonly { language: string; level: string | null }[]): EnglishLevel | null {
  const en = languages.find((l) => /english|англ/i.test(l.language));
  return en?.level ? englishLevelOf(en.level) : null;
}

/** True when the job asks for more English than the candidate has (unknown on either side is not a gap). */
export function englishGap(required: EnglishLevel | null, candidate: EnglishLevel | null): boolean {
  return required !== null && candidate !== null && rank(required) > rank(candidate);
}
