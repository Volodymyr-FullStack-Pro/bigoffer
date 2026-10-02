import type { RemoteType, Seniority } from './job';
import { SENIORITIES } from './job';
import { regionBucket } from './normalize';
import type { SearchProfile } from './search';

export type ScorableJob = {
  title: string;
  descriptionText: string;
  tags: string[];
  remoteType: RemoteType;
  seniority: Seniority | null;
  location: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  skills?: string[];
};

export type MatchBreakdown = {
  skills: number;
  role: number;
  seniority: number;
  location: number;
  salary: number;
  matchedSkills: string[];
  excludedBy: string | null;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}+#])${escapeRegex(t)}($|[^\\p{L}\\p{N}+#])`, 'iu').test(haystack);
}

function seniorityPoints(wanted: Seniority[], actual: Seniority | null): number {
  if (wanted.length === 0) return 15;
  if (actual === null) return 8;
  if (wanted.includes(actual)) return 15;
  const idx = SENIORITIES.indexOf(actual);
  return wanted.some((w) => Math.abs(SENIORITIES.indexOf(w) - idx) === 1) ? 8 : 0;
}

function locationPoints(profile: SearchProfile, job: ScorableJob): number {
  if (profile.remoteType === 'any') return 15;
  if (job.remoteType === 'unknown') return 8;
  if (profile.remoteType === 'remote') {
    return job.remoteType === 'remote' ? 15 : job.remoteType === 'hybrid' ? 5 : 0;
  }
  if (job.remoteType === 'remote') return 10;
  if (profile.locations.length === 0) return 15;
  const jobBucket = regionBucket(job.location, job.remoteType);
  return profile.locations.some((l) => regionBucket(l, 'office') === jobBucket) ? 15 : 0;
}

function salaryPoints(min: number | null, job: ScorableJob): number {
  if (min === null) return 10;
  const best = job.salaryMaxUsd ?? job.salaryMinUsd;
  if (best === null) return 5;
  return best >= min ? 10 : 0;
}

export function scoreJob(
  profile: SearchProfile,
  job: ScorableJob,
): { score: number; hidden: boolean; breakdown: MatchBreakdown } | null {
  const title = job.title.toLowerCase();
  const text = `${title}\n${job.tags.join(' ').toLowerCase()}\n${job.descriptionText.toLowerCase()}`;

  const inTitle = profile.keywords.some((k) => containsTerm(title, k));
  const inText = inTitle || profile.keywords.some((k) => containsTerm(text, k));
  const jobSkills = (job.skills ?? []).map((s) => s.toLowerCase());
  const matchedSkills = profile.skills.filter(
    (s) => jobSkills.includes(s.toLowerCase()) || containsTerm(text, s),
  );

  if (!inText && matchedSkills.length === 0) return null;

  const role = inTitle ? 25 : inText ? 12 : 0;
  const skills =
    profile.skills.length === 0 ? (inText ? 35 : 0) : Math.round((35 * matchedSkills.length) / profile.skills.length);
  const breakdown: MatchBreakdown = {
    skills,
    role,
    seniority: seniorityPoints(profile.seniority, job.seniority),
    location: locationPoints(profile, job),
    salary: salaryPoints(profile.salaryMinUsd, job),
    matchedSkills,
    excludedBy: profile.excludeKeywords.find((e) => containsTerm(text, e))?.toLowerCase() ?? null,
  };
  const score = Math.min(
    100,
    breakdown.skills + breakdown.role + breakdown.seniority + breakdown.location + breakdown.salary,
  );
  return { score, hidden: breakdown.excludedBy !== null, breakdown };
}
