import { DEFAULT_FOLLOW_UP, isLocale, type LocalizedText, localized } from '@jp/core';
import { getLocale, getTimeZone, getTranslations } from 'next-intl/server';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { parseUiPrefs } from '@/lib/ui-prefs';
import { Board } from './board';
import type { BoardCard, BoardColumn, BoardLabel } from './board-types';
import { isReplyKind } from './reply-kinds';

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { card: openCard, add, title: addTitle } = await searchParams;
  // The browser button sends the page the user was on; only web links are taken.
  const addLink = typeof add === 'string' && /^https?:\/\//i.test(add) && add.length <= 2000 ? { url: add, title: typeof addTitle === 'string' ? addTitle.slice(0, 200) : '' } : null;
  const userId = await requireUserId();
  const t = await getTranslations('board');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const [{ data: columns }, { data: apps }, { data: labels }, { data: profile }, { data: messages }] = await Promise.all([
    supabase.from('board_columns').select('id, key, title, kind').order('position'),
    supabase
      .from('applications')
      .select(
        'id, job_id, column_id, rank, title, company, url, source_id, salary, notes, contact, applied_at, next_action_at, feedback_due_at, first_response_at, last_activity_at, follow_up_count, outcome, reply_kind, rejection_reasons, rejection_stage, application_labels(label_id)',
      )
      .order('rank'),
    supabase.from('labels').select('id, key, name, color').order('key', { nullsFirst: false }),
    supabase.from('profiles').select('follow_up_days, ghost_after_days, ui_prefs').eq('id', userId).single(),
    supabase.from('application_messages').select('application_id, direction, sent_at').order('sent_at', { ascending: false }).limit(2000),
  ]);
  // The match score of each card's job: which silent companies are worth a reminder first.
  const jobIds = [...new Set((apps ?? []).flatMap((a) => (a.job_id ? [a.job_id] : [])))];
  const { data: scores } = jobIds.length ? await supabase.from('job_matches').select('job_id, score').eq('user_id', userId).in('job_id', jobIds) : { data: [] };
  const scoreByJob = new Map<string, number>();
  for (const m of scores ?? []) scoreByJob.set(m.job_id, Math.max(scoreByJob.get(m.job_id) ?? 0, Math.round(Number(m.score))));
  const lastMessage = new Map<string, { direction: 'in' | 'out'; at: string }>();
  const messageCount = new Map<string, number>();
  for (const m of messages ?? []) {
    messageCount.set(m.application_id, (messageCount.get(m.application_id) ?? 0) + 1);
    if (!lastMessage.has(m.application_id)) lastMessage.set(m.application_id, { direction: m.direction === 'in' ? 'in' : 'out', at: m.sent_at });
  }

  const boardColumns: BoardColumn[] = (columns ?? []).map((c) => ({
    id: c.id,
    key: c.key,
    title: localized(c.title as LocalizedText, locale) || c.key,
    kind: c.kind === 'won' || c.kind === 'lost' ? c.kind : 'active',
  }));
  const cards: BoardCard[] = (apps ?? []).map((a) => {
    const contact = (a.contact ?? {}) as { name?: unknown; url?: unknown; meet?: unknown };
    return {
      id: a.id,
      jobId: a.job_id,
      columnId: a.column_id,
      rank: a.rank,
      title: a.title,
      company: a.company,
      url: a.url,
      sourceId: a.source_id,
      salary: a.salary,
      notes: a.notes,
      contactName: typeof contact.name === 'string' ? contact.name : null,
      contactUrl: typeof contact.url === 'string' ? contact.url : null,
      meetingUrl: typeof contact.meet === 'string' ? contact.meet : null,
      appliedAt: a.applied_at,
      nextActionAt: a.next_action_at,
      feedbackDueAt: a.feedback_due_at,
      firstResponseAt: a.first_response_at,
      lastActivityAt: a.last_activity_at,
      followUpCount: a.follow_up_count,
      outcome: a.outcome,
      labelIds: a.application_labels.map((l) => l.label_id),
      replyKind: isReplyKind(a.reply_kind) ? a.reply_kind : null,
      lastMessage: lastMessage.get(a.id) ?? null,
      messageCount: messageCount.get(a.id) ?? 0,
      rejectionReasons: a.rejection_reasons ?? [],
      rejectionStage: a.rejection_stage,
      score: a.job_id ? (scoreByJob.get(a.job_id) ?? null) : null,
    };
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl md:text-4xl">{t('title')}</h1>
      <Board
        columns={boardColumns}
        cards={cards}
        labels={(labels ?? []) as BoardLabel[]}
        rules={{ followUpDays: profile?.follow_up_days ?? DEFAULT_FOLLOW_UP.followUpDays, ghostAfterDays: profile?.ghost_after_days ?? DEFAULT_FOLLOW_UP.ghostAfterDays }}
        now={new Date().toISOString()}
        timeZone={await getTimeZone()}
        savedSort={parseUiPrefs(profile?.ui_prefs).boardSort}
        initialOpenId={typeof openCard === 'string' ? openCard : null}
        addLink={addLink}
      />
    </section>
  );
}
