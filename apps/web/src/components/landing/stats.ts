import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type LandingStats = {
  /** When the numbers were read (ms): "5 min ago" is counted from here, not from a clock read during render. */
  fetchedAt: number;
  day: number;
  week: number;
  recent: { title: string; company: string; source: string | null; at: string | null }[];
};

/** Public numbers for the landing (jobs seen in 24 h / 7 days, the freshest postings); null when the query fails. */
export async function loadLandingStats(): Promise<LandingStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('public_landing_stats');
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as { day?: unknown; week?: unknown; recent?: unknown };
  const recent = Array.isArray(d.recent)
    ? d.recent.flatMap((r) => {
        const j = r as { title?: unknown; company?: unknown; source?: unknown; at?: unknown };
        return typeof j.title === 'string' && typeof j.company === 'string'
          ? [{ title: j.title, company: j.company, source: typeof j.source === 'string' ? j.source : null, at: typeof j.at === 'string' ? j.at : null }]
          : [];
      })
    : [];
  return { fetchedAt: Date.now(), day: Number(d.day) || 0, week: Number(d.week) || 0, recent };
}
