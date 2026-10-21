import { detectRemote, remoteRuledOut } from '@jp/core';
import type { Db } from '../db';
import { rescoreJobs } from './rescore';

const PAGE = 500;

/**
 * Active jobs stored as remote whose text rules remote out ("remote is not considered", "only in the office") get the
 * format the text gives, and are rescored, so a "remote only" search stops showing them. A job the board itself marks
 * remote but whose text never rules it out is left alone.
 */
export async function redetectFormat(db: Db): Promise<{ checked: number; changed: number; rescored: number }> {
  let checked = 0;
  const changed: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('jobs')
      .select('id, title, location, description_text')
      .eq('status', 'active')
      .eq('remote_type', 'remote')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const job of data) {
      checked++;
      const text = `${job.title} ${job.location ?? ''} ${job.description_text.slice(0, 3000)}`;
      if (!remoteRuledOut(text)) continue;
      const format = detectRemote(text);
      if (format === 'remote') continue;
      const { error: updateError } = await db.from('jobs').update({ remote_type: format }).eq('id', job.id);
      if (updateError) throw updateError;
      changed.push(job.id);
    }
    if (data.length < PAGE) break;
  }
  const rescored = await rescoreJobs(db, changed);
  return { checked, changed: changed.length, rescored };
}
