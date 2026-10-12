import { keywordForms, MAIN_SOURCE_IDS, sourceInfo } from '@jp/core';

export type ProfileTip =
  | { id: 'keywords'; items: string[] }
  | { id: 'cvSkills'; items: string[] }
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
  if (keywords.length > 0 && p.keywords.length < 10) tips.push({ id: 'keywords', items: keywords });
  if (p.roles.length === 0) tips.push({ id: 'roles' });
  const mine = new Set(p.skills.map((s) => s.toLowerCase()));
  const cvSkills = p.cvSkills.filter((s) => !mine.has(s.toLowerCase())).slice(0, 5);
  if (cvSkills.length > 0 && p.skills.length < 30) tips.push({ id: 'cvSkills', items: cvSkills });
  if ((p.remoteType === 'hybrid' || p.remoteType === 'office') && p.locations.length === 0) tips.push({ id: 'cities' });
  return tips;
}
