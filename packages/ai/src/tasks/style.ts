/**
 * Phrases that make application text read as generated or as the posting's own marketing. The prompts ban them, but
 * models still slip; a draft that uses one is rewritten once.
 */
const BANNED: readonly RegExp[] = [
  /next[- ]generation/i,
  /mission[- ]critical/i,
  /world[- ]class/i,
  /cutting[- ]edge/i,
  /\bpassionate\b/i,
  /team player/i,
  /\bI bring\b/i,
  /\balign(?:s|ed)?(?: perfectly| closely)? with\b/i,
  /well[- ](?:prepared|positioned)/i,
  /I am confident that/i,
  /for your technical requirements/i,
];

/** The banned phrases found in the text, as written there. */
export function bannedPhrases(text: string): string[] {
  return BANNED.flatMap((re) => {
    const m = text.match(re);
    return m ? [m[0]] : [];
  });
}

/** An instruction for the rewrite, appended to the prompt. */
export function rewriteNote(found: readonly string[]): string {
  return `\n\nYour previous draft used these phrases: ${found.map((f) => `"${f}"`).join(', ')}. Write it again without them (and without synonyms of them), keeping every fact.`;
}
