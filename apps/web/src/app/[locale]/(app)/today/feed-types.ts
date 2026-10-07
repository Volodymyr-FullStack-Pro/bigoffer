export type RemoteType = 'remote' | 'hybrid' | 'office' | 'unknown';

export type FeedMatch = {
  id: string;
  jobId: string;
  score: number;
  title: string;
  company: string;
  location: string | null;
  remoteType: RemoteType;
  seniority: 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  summary: string | null;
  why: string | null;
  description: string;
  skills: { name: string; matched: boolean }[];
  /** Profile skills the job does not mention (shown as ✗ in details). */
  missingSkills: string[];
  breakdown: { skills: number; role: number; seniority: number; location: number; salary: number } | null;
  profileId: string | null;
  createdAt: string;
  /** When the board says the job was posted (null if unknown). */
  postedAt: string | null;
  firstSeenAt: string;
  postings: { sourceId: string; url: string }[];
};
