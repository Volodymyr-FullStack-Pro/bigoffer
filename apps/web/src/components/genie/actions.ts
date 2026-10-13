'use server';

import { MAIN_SOURCE_IDS, sourceInfo } from '@jp/core';
import { getUserId } from '@/lib/auth';
import { type GenieState, streaks } from '@/lib/genie/brain';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { parseUiPrefs } from '@/lib/ui-prefs';

const STALE_MS = 3 * 3600_000;

/** Local calendar date (YYYY-MM-DD) and hour of an instant in the user's time zone. */
function local(at: Date, tz: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function safeTz(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'Europe/Kyiv';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/Kyiv';
  }
}

/** Everything the Offer Genie reasons about, in one round trip. */
export async function getGenieState(tzRaw: string): Promise<GenieState | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const tz = safeTz(tzRaw);
  const now = new Date();
  const supabase = await createClient();
  const since14d = new Date(now.getTime() - 15 * 24 * 3600_000).toISOString();
  const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const since2h = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const waitingSince = new Date(now.getTime() - 5 * 24 * 3600_000).toISOString();
  const savedSince = new Date(now.getTime() - 2 * 24 * 3600_000).toISOString();
  const dayAhead = new Date(now.getTime() + 24 * 3600_000).toISOString();

  const [{ data: me }, { data: profiles }, { data: applied }, fresh, hot, hidden, waiting, cv, soon, saved] = await Promise.all([
    supabase.from('profiles').select('ui_prefs, timezone, full_name, telegram_chat_id').eq('id', userId).maybeSingle(),
    supabase.from('search_profiles').select('is_active, sources'),
    supabase.from('applications').select('applied_at').gte('applied_at', since14d),
    supabase.from('job_matches').select('id', { count: 'exact', head: true }).in('state', ['new', 'seen']).gte('created_at', since24h),
    supabase.from('job_matches').select('id', { count: 'exact', head: true }).eq('state', 'new').gte('score', 80).gte('created_at', since2h),
    // Same set as the feed's "Hidden by rules" toggle: active, recent, not stale.
    supabase
      .from('job_matches')
      .select('id, jobs!inner(status)', { count: 'exact', head: true })
      .eq('state', 'hidden')
      .not('breakdown->>excludedBy', 'is', null)
      .eq('jobs.status', 'active')
      .gte('created_at', new Date(now.getTime() - 3 * 24 * 3600_000).toISOString())
      .or(`posted_at.is.null,posted_at.gte.${new Date(now.getTime() - 30 * 24 * 3600_000).toISOString()}`, { referencedTable: 'jobs' }),
    supabase
      .from('applications')
      .select('id, board_columns!inner(key)', { count: 'exact', head: true })
      .eq('board_columns.key', 'applied')
      .lt('applied_at', waitingSince)
      .is('first_response_at', null),
    supabase.from('resumes').select('id', { count: 'exact', head: true }).eq('is_primary', true).not('parsed', 'is', null),
    supabase
      .from('applications')
      .select('id, board_columns!inner(key)', { count: 'exact', head: true })
      .in('board_columns.key', ['interview', 'test_task'])
      .gte('next_action_at', now.toISOString())
      .lte('next_action_at', dayAhead),
    supabase
      .from('applications')
      .select('id, board_columns!inner(key)', { count: 'exact', head: true })
      .eq('board_columns.key', 'saved')
      .lt('created_at', savedSince),
  ]);

  const prefs = parseUiPrefs(me?.ui_prefs).genie ?? {};
  // The profile's time zone decides "today"; the browser's is the fallback.
  const zone = me?.timezone ? safeTz(me.timezone) : tz;
  const goal = prefs.goal ?? 5;
  const today = local(now, zone);
  const dates = (applied ?? []).flatMap((a) => (a.applied_at ? [local(new Date(a.applied_at), zone).date] : []));
  const { streak, idleDays } = streaks(dates.filter((d) => d !== today.date), today.date, goal);

  // Board health is not personal: read the main boards' last successful runs with the service client.
  const active = (profiles ?? []).filter((p) => p.is_active);
  const watched = new Set(active.flatMap((p) => p.sources ?? [...MAIN_SOURCE_IDS]).filter((id) => (MAIN_SOURCE_IDS as readonly string[]).includes(id)));
  let staleSources: string[] = [];
  let lastRunMinutes: number | null = null;
  if (watched.size > 0 && process.env.SUPABASE_SECRET_KEY) {
    const admin = createAdminSupabase();
    const runs = await Promise.all(
      [...watched].map(async (id) => {
        const { data } = await admin.from('source_runs').select('finished_at').eq('source_id', id).eq('status', 'ok').order('finished_at', { ascending: false }).limit(1).maybeSingle();
        return { id, at: data?.finished_at ? Date.parse(data.finished_at) : null };
      }),
    );
    staleSources = runs.filter((r) => r.at === null || now.getTime() - r.at > STALE_MS).map((r) => sourceInfo(r.id)?.name ?? r.id);
    const latest = Math.max(...runs.map((r) => r.at ?? 0));
    lastRunMinutes = latest > 0 ? Math.round((now.getTime() - latest) / 60_000) : null;
  }

  return {
    mode: prefs.mode ?? 'on',
    goal,
    appliedToday: dates.filter((d) => d === today.date).length,
    streak,
    idleDays,
    hour: today.hour,
    hasProfile: (profiles ?? []).length > 0,
    profileActive: active.length > 0,
    staleSources,
    lastRunMinutes,
    newMatches24h: fresh.count ?? 0,
    hotMatches: hot.count ?? 0,
    ruleHidden: hidden.count ?? 0,
    waitingReplies: waiting.count ?? 0,
    firstName: (me?.full_name ?? '').trim().split(/\s+/)[0] ?? '',
    hasCv: (cv.count ?? 0) > 0,
    interviewsSoon: soon.count ?? 0,
    savedWaiting: saved.count ?? 0,
    telegramLinked: me?.telegram_chat_id != null,
  };
}
