import { normalizeJob } from '@jp/core';
import { type AdapterContext, fetchPosting } from '@jp/scrapers';
import type { Db } from '../db';
import { saveJob } from './repository';

export type ImportedJob = {
  jobId: string;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  recruiter: string | null;
};

/**
 * A vacancy the user pasted by link: read from the board (even when no longer listed), stored like a scraped job so
 * the apply kit can use its full description. Null when the link is not a vacancy of DOU, Djinni or robota.ua.
 */
export async function importJob(db: Db, ctx: AdapterContext, url: string, now: Date): Promise<ImportedJob | null> {
  const posting = await fetchPosting(url, ctx);
  if (!posting) return null;
  const job = await normalizeJob(posting.job);
  if (!job) return null;
  const { jobId } = await saveJob(db, posting.sourceId, job, now);
  return {
    jobId,
    sourceId: posting.sourceId,
    url: job.url,
    title: job.title,
    company: job.companyIsPlaceholder ? '' : job.company,
    location: job.location,
    salary: job.salaryRaw,
    recruiter: posting.recruiter,
  };
}
