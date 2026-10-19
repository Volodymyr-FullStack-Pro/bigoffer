import { coreStackOf, namedPlatforms, titleFrameworks } from './score';

/** Hides of one technology it takes before the feed suggests hiding such jobs on its own. */
export const HIDE_SUGGESTION_MIN = 4;

export type HideSuggestion = {
  /** The technology or platform, as the titles name it ("Angular", ".NET", "Shopify"). */
  term: string;
  /** How many of the user's own hides named it. */
  count: number;
  /** 'stack': covered by "hide jobs on another stack"; 'keyword': only an exclude word hides it. */
  kind: 'stack' | 'keyword';
};

/**
 * What the user keeps hiding by hand, read from the titles of jobs they hid themselves: technologies they do not
 * list among their skills, named in at least HIDE_SUGGESTION_MIN titles. Stacks drop out once "hide jobs on another
 * stack" is on; words already excluded drop out too. Most frequent first, at most `limit`.
 */
export function hideSuggestions(
  hiddenTitles: readonly string[],
  profile: { skills: readonly string[]; excludeKeywords: readonly string[]; hideOtherStacks: boolean },
  limit = 3,
): HideSuggestion[] {
  const has = (term: string) => profile.skills.some((s) => s.toLowerCase() === term.toLowerCase());
  const excluded = (term: string) => profile.excludeKeywords.some((e) => e.toLowerCase() === term.toLowerCase());
  const counts = new Map<string, number>();
  for (const title of hiddenTitles) {
    for (const term of new Set([...namedPlatforms(title, []), ...titleFrameworks(title)])) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const stackOf = (term: string) => coreStackOf(term) ?? (titleFrameworks(term).length > 0 ? term : null);
  // A stack the user works in is not one to hide ("Python" stays for a Python developer).
  const ownStacks = new Set(profile.skills.map(stackOf).filter((s): s is string => s !== null));
  return [...counts]
    .filter(([term, count]) => count >= HIDE_SUGGESTION_MIN && !has(term) && !excluded(term))
    .map(([term, count]): HideSuggestion => ({ term, count, kind: stackOf(term) ? 'stack' : 'keyword' }))
    .filter((s) => !(s.kind === 'stack' && (profile.hideOtherStacks || ownStacks.has(stackOf(s.term)!))))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}
