import { DEFAULT_FOLLOW_UP, isLocale, type LocalizedText, localized } from '@jp/core';
import { getLocale, getTimeZone, getTranslations } from 'next-intl/server';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Board } from './board';
import type { BoardCard, BoardColumn, BoardLabel } from './board-types';

export default async function BoardPage() {
  const userId = await requireUserId();
  const t = await getTranslations('board');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const [{ data: columns }, { data: apps }, { data: labels }, { data: profile }] = await Promise.all([
    supabase.from('board_columns').select('id, key, title, kind').order('position'),
    supabase
      .from('applications')
      .select(
        'id, job_id, column_id, rank, title, company, url, source_id, salary, notes, contact, applied_at, next_action_at, first_response_at, last_activity_at, follow_up_count, outcome, application_labels(label_id)',
      )
      .order('rank'),
    supabase.from('labels').select('id, key, name, color').order('key', { nullsFirst: false }),
    supabase.from('profiles').select('follow_up_days, ghost_after_days').eq('id', userId).single(),
  ]);

  const boardColumns: BoardColumn[] = (columns ?? []).map((c) => ({
    id: c.id,
    key: c.key,
    title: localized(c.title as LocalizedText, locale) || c.key,
    kind: c.kind === 'won' || c.kind === 'lost' ? c.kind : 'active',
  }));
  const cards: BoardCard[] = (apps ?? []).map((a) => {
    const contact = (a.contact ?? {}) as { name?: unknown; url?: unknown };
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
      appliedAt: a.applied_at,
      nextActionAt: a.next_action_at,
      firstResponseAt: a.first_response_at,
      lastActivityAt: a.last_activity_at,
      followUpCount: a.follow_up_count,
      outcome: a.outcome,
      labelIds: a.application_labels.map((l) => l.label_id),
    };
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      <Board
        columns={boardColumns}
        cards={cards}
        labels={(labels ?? []) as BoardLabel[]}
        rules={{ followUpDays: profile?.follow_up_days ?? DEFAULT_FOLLOW_UP.followUpDays, ghostAfterDays: profile?.ghost_after_days ?? DEFAULT_FOLLOW_UP.ghostAfterDays }}
        now={new Date().toISOString()}
        timeZone={await getTimeZone()}
      />
    </section>
  );
}
