const ALIASES: Record<string, string> = {
  node: 'nodejs',
  react: 'reactjs',
  next: 'nextjs',
  vue: 'vuejs',
  nest: 'nestjs',
  express: 'expressjs',
  postgres: 'postgresql',
  tailwindcss: 'tailwind',
  k8s: 'kubernetes',
  js: 'javascript',
  ts: 'typescript',
  golang: 'go',
  restapi: 'rest',
  restapis: 'rest',
  reduxtoolkit: 'redux',
  amazonwebservices: 'aws',
  githubactions: 'cicd',
};

/** One key per technology: "Node.js" = "NodeJS" = "node", "Tailwind CSS" = "Tailwind", "REST APIs" = "REST". */
export function skillKey(name: string): string {
  const k = name.toLowerCase().replace(/\.js\b/g, 'js').replace(/[^a-z0-9#+]/g, '');
  return ALIASES[k] ?? k;
}

/** Skills chips for a match card: the ones the user has first, at most `max`. */
export function cardSkills(jobSkills: string[], matched: string[], max = 5, userSkills: string[] = []): { name: string; matched: boolean }[] {
  const have = new Set([...matched, ...userSkills].map(skillKey));
  const source = jobSkills.length > 0 ? jobSkills : matched;
  const seen = new Set<string>();
  const chips = source
    .filter((name) => {
      const k = skillKey(name);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((name) => ({ name, matched: have.has(skillKey(name)) }));
  return [...chips.filter((c) => c.matched), ...chips.filter((c) => !c.matched)].slice(0, max);
}

/** breakdown is jsonb written by the pipeline; read matchedSkills defensively. */
export function matchedSkillsOf(breakdown: unknown): string[] {
  const value = (breakdown as { matchedSkills?: unknown } | null)?.matchedSkills;
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];
}
