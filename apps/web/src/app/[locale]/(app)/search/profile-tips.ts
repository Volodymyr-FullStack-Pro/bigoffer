import { keywordForms, MAIN_SOURCE_IDS, MAX_KEYWORDS, sourceInfo } from '@jp/core';
import { hasSkill } from '../today/card-skills';

export type ProfileTip =
  | { id: 'keywords'; items: string[] }
  | { id: 'cvSkills'; items: string[] }
  | { id: 'demandSkills'; items: string[] }
  | { id: 'mainSources'; items: string[] }
  | { id: 'roles' }
  | { id: 'cities' };

const covered = (chosen: readonly string[]) => new Set(chosen.flatMap(keywordForms));

/** What would make this search find more of the right jobs, worst gap first. Empty when the profile is in good shape. */
export function profileTips(p: {
  keywords: readonly string[];
  recommended: readonly string[];
  skills: readonly string[];
  cvSkills: readonly string[];
  /** Skills the user's matches ask for most (see the search page). */
  demandSkills?: readonly string[];
  roles: readonly string[];
  remoteType: string;
  locations: readonly string[];
  sources: ReadonlySet<string>;
}): ProfileTip[] {
  const tips: ProfileTip[] = [];
  const missingMain = MAIN_SOURCE_IDS.filter((id) => !p.sources.has(id)).map((id) => sourceInfo(id)?.name ?? id);
  if (missingMain.length > 0) tips.push({ id: 'mainSources', items: missingMain });
  const have = covered(p.keywords);
  const keywords = p.recommended.filter((k) => !keywordForms(k).some((f) => have.has(f))).slice(0, 3);
  if (keywords.length > 0 && p.keywords.length < MAX_KEYWORDS) tips.push({ id: 'keywords', items: keywords });
  if (p.roles.length === 0) tips.push({ id: 'roles' });
  // "CSS/SASS" from the CV is covered by "CSS" + "SASS", "MCP" by "Model Context Protocol (MCP)".
  const cvSkills = p.cvSkills.filter((s) => !hasSkill(p.skills, s)).slice(0, 5);
  if (cvSkills.length > 0 && p.skills.length < 100) tips.push({ id: 'cvSkills', items: cvSkills });
  // Asked often in the user's own matches but in neither the profile nor the CV (the CV ones have the tip above);
  // the user adds only those they know.
  const asked = (p.demandSkills ?? []).filter((s) => !hasSkill(p.skills, s) && !hasSkill(p.cvSkills, s)).slice(0, 5);
  if (asked.length > 0 && p.skills.length < 100) tips.push({ id: 'demandSkills', items: asked });
  if ((p.remoteType === 'hybrid' || p.remoteType === 'office') && p.locations.length === 0) tips.push({ id: 'cities' });
  return tips;
}
