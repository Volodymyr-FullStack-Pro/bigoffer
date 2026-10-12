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
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
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
  postings: { sourceId: string; url: string }[];
  /** Years of experience the posting asks for (null when it states none). */
  requiredYears: number | null;
  /** The user's years of experience from their CV, to compare with requiredYears. */
  candidateYears: number | null;
  /** Why the profile rules hid it: 'seniority' | 'role' | 'format' | 'region' | an exclude word; null when shown. */
  excludedBy: string | null;
  /** Board column the user already has this job in (same job, or the same company + title from another board). */
  onBoard: string | null;
};
