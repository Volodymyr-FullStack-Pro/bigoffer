import { SENIORITIES, SOURCE_IDS, type Seniority, type SourceId } from './job';
import { ROLE_FAMILIES, type RoleFamily } from './roles';
import type { SearchProfile } from './search';

/** A search_profiles row (with the owner's country) as the scorer reads it. */
export type SearchProfileRow = {
  id: string;
  user_id: string;
  keywords: string[];
  skills: string[];
  exclude_keywords: string[];
  hide_other_stacks?: boolean;
  seniority: string[];
  locations: string[];
  remote_type: string;
  salary_min_usd: number | null;
  sources: string[] | null;
  target_roles?: string[];
  is_active?: boolean;
  profiles?: { country: string | null } | null;
};

export const SEARCH_PROFILE_COLUMNS =
  'id, user_id, keywords, target_roles, skills, exclude_keywords, hide_other_stacks, seniority, locations, remote_type, salary_min_usd, sources, is_active, profiles(country)';

export function toSearchProfile(row: SearchProfileRow): SearchProfile {
  return {
    id: row.id,
    userId: row.user_id,
    keywords: row.keywords,
    targetRoles: (row.target_roles ?? []).filter((r): r is RoleFamily => (ROLE_FAMILIES as readonly string[]).includes(r)),
    skills: row.skills,
    excludeKeywords: row.exclude_keywords,
    hideOtherStacks: row.hide_other_stacks ?? false,
    seniority: row.seniority.filter((s): s is Seniority => (SENIORITIES as readonly string[]).includes(s)),
    locations: row.locations,
    remoteType: (['any', 'remote', 'hybrid', 'office'] as const).find((r) => r === row.remote_type) ?? 'any',
    salaryMinUsd: row.salary_min_usd,
    sources: (() => {
      const valid = (row.sources ?? []).filter((s): s is SourceId => (SOURCE_IDS as readonly string[]).includes(s));
      return valid.length > 0 ? valid : null;
    })(),
    candidateCountry: row.profiles?.country ?? null,
  };
}
