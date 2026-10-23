import type { JobDomain, JobPerk } from '@jp/core';

export type RemoteType = 'remote' | 'hybrid' | 'office' | 'unknown';

export type FeedMatch = {
  id: string;
  jobId: string;
  score: number;
  title: string;
  company: string;
  companyIsPlaceholder: boolean;
  location: string | null;
  remoteType: RemoteType;
  seniority: 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null;
  /** Pay for this role and level on the market (recent jobs with a stated salary); null without enough data. */
  market?: { p25: number; median: number; p75: number; n: number } | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  /** Djinni's relative pay level (1 below average … 4 top) when no amount is published. */
  payLevel: 1 | 2 | 3 | 4 | null;
  summary: string | null;
  why: string | null;
  description: string;
  skills: { name: string; matched: boolean }[];
  /** Every technology the job asks for, the user's own first (matched = in their profile skills). */
  techs: { name: string; matched: boolean }[];
  breakdown: { skills: number; role: number; seniority: number; location: number; salary: number } | null;
  profileId: string | null;
  createdAt: string;
  /** When the board says the job was posted (null if unknown). */
  postedAt: string | null;
  firstSeenAt: string;
  /** The latest date a board re-published (bumped) the job, when that came after its first posting. */
  refreshedAt?: string | null;
  postings: { sourceId: string; url: string }[];
  /** Years of experience the posting asks for (null when it states none). */
  requiredYears: number | null;
  /** The user's years of experience from their CV, to compare with requiredYears. */
  candidateYears: number | null;
  /** CEFR English level the job asks for (board tag or text), and the user's from the CV. */
  requiredEnglish: string | null;
  candidateEnglish: string | null;
  /** Why the profile rules hid it: 'seniority' | 'role' | 'format' | 'region' | an exclude word; null when shown. */
  excludedBy: string | null;
  /** Field of the vacancy (fintech, gamedev, …); 'military' = service in the armed forces. */
  domains: JobDomain[];
  /** Stated conditions: reservation from mobilisation, a test task, part-time, urgent. */
  perks: JobPerk[];
  /** Board column the user already has this job in (same job, or the same company + title from another board). */
  onBoard: string | null;
  /** Platforms this job is posted on that have no card on the board yet. */
  onBoardLeft: string[];
  /** Another vacancy of this company already on the board (title and column); shown when this one is not. */
  /** Another vacancy of this company on the board: its title, column and the platform it was applied on. */
  companyOnBoard: { title: string; column: string; sourceId: string | null } | null;
};
