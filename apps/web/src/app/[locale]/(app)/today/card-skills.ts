/** Skills chips for a match card: the ones the user searched for first, at most `max`. */
export function cardSkills(jobSkills: string[], matched: string[], max = 5): { name: string; matched: boolean }[] {
  const wanted = new Set(matched.map((s) => s.toLowerCase()));
  const source = jobSkills.length > 0 ? jobSkills : matched;
  const chips = source.map((name) => ({ name, matched: wanted.has(name.toLowerCase()) }));
  return [...chips.filter((c) => c.matched), ...chips.filter((c) => !c.matched)].slice(0, max);
}

/** breakdown is jsonb written by the pipeline; read matchedSkills defensively. */
export function matchedSkillsOf(breakdown: unknown): string[] {
  const value = (breakdown as { matchedSkills?: unknown } | null)?.matchedSkills;
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];
}
