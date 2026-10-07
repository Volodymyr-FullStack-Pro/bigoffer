import type { RemoteType, Seniority } from './job';
import { SENIORITIES } from './job';
import { regionBucket } from './normalize';
import type { SearchProfile } from './search';
import { remoteBlockedFor } from './regions';

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
  /** AI verdict; false means the posting is not a real vacancy (course, ad, spam). */
  isJob?: boolean | null;
  /** AI: where a remote hire may live (region codes or ISO countries); empty when not stated. */
  remoteRegions?: string[];
};

export type MatchBreakdown = {
  skills: number;
  role: number;
  seniority: number;
  location: number;
  salary: number;
  matchedSkills: string[];
  excludedBy: string | null;
  /** The job's remote regions when they exclude the candidate's country. */
  blockedRegions: string[] | null;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const AMBIGUOUS = new Set(['go', 'r', 'c', 'd', 'swift', 'dart', 'express', 'spring']);

function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\.js\b/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\bfullstack\b/g, 'full stack')
    .replace(/\bfrontend\b/g, 'front end')
    .replace(/\bbackend\b/g, 'back end')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordPattern(word: string): string {
  if (/^\p{Script=Cyrillic}+$/u.test(word) && word.length >= 5) {
    return `${escapeRegex(word.slice(0, -2))}\\p{Script=Cyrillic}{0,3}`;
  }
  return escapeRegex(word);
}

const regexCache = new Map<string, RegExp>();

function isStrictTerm(term: string): boolean {
  const t = term.trim();
  return t.length <= 2 || AMBIGUOUS.has(t.toLowerCase());
}

/** strict: case-sensitive match against the original text (for short/ambiguous skills). */
function termRegex(term: string, strict: boolean): RegExp {
  const key = `${strict ? 's' : 'n'}:${term}`;
  let re = regexCache.get(key);
  if (!re) {
    const t = term.trim();
    const short = t.length <= 2;
    const right = strict ? '\\p{L}\\p{N}+#-' : short ? '\\p{L}\\p{N}+#' : '\\p{L}\\p{N}';
    const body = strict
      ? escapeRegex(t.normalize('NFC'))
      : normalizeText(t).split(' ').map(wordPattern).join('\\s+');
    re = new RegExp(`(^|[^\\p{L}\\p{N}])${body}($|[^${right}])`, strict ? 'u' : 'iu');
    regexCache.set(key, re);
  }
  return re;
}

function containsTerm(normalized: string, term: string): boolean {
  if (!term.trim()) return false;
  return termRegex(term, false).test(normalized);
}

function containsSkill(raw: string, normalized: string, term: string): boolean {
  if (!term.trim()) return false;
  return isStrictTerm(term) ? termRegex(term, true).test(raw) : termRegex(term, false).test(normalized);
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
  if (job.isJob === false) return null;
  const title = normalizeText(job.title);
  const raw = `${job.title}\n${job.tags.join(' ')}\n${job.descriptionText}`;
  const text = normalizeText(raw);

  const inTitle = profile.keywords.some((k) => containsTerm(title, k));
  const inText = inTitle || profile.keywords.some((k) => containsTerm(text, k));
  const jobSkills = (job.skills ?? []).map((s) => s.toLowerCase());
  const matchedSkills = profile.skills.filter(
    (s) => jobSkills.includes(s.toLowerCase()) || containsSkill(raw, text, s),
  );

  const relevant =
    inText || matchedSkills.length >= 2 || (matchedSkills.length === 1 && profile.skills.length === 1);
  if (!relevant) return null;

  const role = inTitle ? 25 : inText ? 12 : 0;
  const skills =
    profile.skills.length === 0 ? (inText ? 35 : 0) : Math.round((35 * matchedSkills.length) / profile.skills.length);
  const regions = job.remoteRegions ?? [];
  const blockedRegions =
    job.remoteType === 'remote' && remoteBlockedFor(regions, profile.candidateCountry) ? regions : null;
  const keywordExclusion = profile.excludeKeywords.find((e) => containsTerm(text, e))?.toLowerCase() ?? null;
  const breakdown: MatchBreakdown = {
    skills,
    role,
    seniority: seniorityPoints(profile.seniority, job.seniority),
    location: blockedRegions ? 0 : locationPoints(profile, job),
    salary: salaryPoints(profile.salaryMinUsd, job),
    matchedSkills,
    // 'region' hides the row like an exclude keyword, so upsert_job_matches keeps rescoring it.
    excludedBy: keywordExclusion ?? (blockedRegions ? 'region' : null),
    blockedRegions,
  };
  const score = Math.min(
    100,
    breakdown.skills + breakdown.role + breakdown.seniority + breakdown.location + breakdown.salary,
  );
  return { score, hidden: breakdown.excludedBy !== null, breakdown };
}
