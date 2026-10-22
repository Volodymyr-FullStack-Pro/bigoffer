import { skillKey } from './card-skills';

/**
 * The technology the feed asks for most often that the profile lacks ("CI/CD in 26 jobs"), so one answer — I have it,
 * or I don't — sharpens every score. Skills the user already declined are skipped; below `min` jobs it is not worth asking.
 */
export function missingSkillTip(
  matches: readonly { techs: readonly { name: string; matched: boolean }[] }[],
  declined: readonly string[],
  min = 3,
): { skill: string; count: number } | null {
  const skip = new Set(declined.map(skillKey));
  const counts = new Map<string, { skill: string; count: number }>();
  for (const m of matches) {
    const seen = new Set<string>();
    for (const t of m.techs) {
      const k = skillKey(t.name);
      if (t.matched || !k || skip.has(k) || seen.has(k)) continue;
      seen.add(k);
      const cur = counts.get(k);
      if (cur) cur.count += 1;
      else counts.set(k, { skill: t.name, count: 1 });
    }
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count >= min ? best : null;
}
