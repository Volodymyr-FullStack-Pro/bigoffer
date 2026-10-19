import { createBotApi } from '@jp/core';
import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { watchdogIssues } from '@/lib/watchdog';

/**
 * Daily Vercel Cron: checks from outside Trigger.dev that scraping still runs (when the worker stops, its own health
 * task stops too) and that the database answers, and tells the owner in Telegram.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse('Unauthorized', { status: 401 });
  const chatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  let issues: string[];
  try {
    const db = createAdminSupabase();
    const { data, error } = await db.from('source_runs').select('started_at').eq('status', 'ok').order('started_at', { ascending: false }).limit(1).maybeSingle();
    issues = error ? [`База не відповідає: ${error.message}`] : watchdogIssues({ lastOkRunAt: data?.started_at ?? null, now: new Date() });
  } catch (err) {
    issues = [`База недоступна: ${err instanceof Error ? err.message : 'unknown'}`];
  }
  if (issues.length > 0 && Number.isFinite(chatId) && chatId !== 0) {
    const text = ['⚠️ BigOffer — сторож', ...issues].join('\n\n').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
    await createBotApi(process.env.TELEGRAM_BOT_TOKEN).sendMessage(chatId, text);
  }
  return NextResponse.json({ ok: issues.length === 0, issues });
}
