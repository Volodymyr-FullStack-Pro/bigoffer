import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { asPlan, PREP_COLUMNS } from './prep-types';
import { StartPrep } from './start-prep';

export const maxDuration = 300;

export default async function PrepPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  await requireUserId();
  const { start } = await searchParams;
  const t = await getTranslations('prep');
  const supabase = await createClient();
  const [{ data: preps }, { data: apps }] = await Promise.all([
    supabase.from('interview_preps').select('id, application_id, plan, done, updated_at, applications(title, company)').order('updated_at', { ascending: false }),
    supabase
      .from('applications')
      .select('id, title, company, next_action_at, reply_kind, board_columns!inner(key)')
      .in('board_columns.key', [...PREP_COLUMNS])
      .order('next_action_at', { ascending: true, nullsFirst: false }),
  ]);
  const prepared = new Set((preps ?? []).map((p) => p.application_id));
  const candidates = (apps ?? []).filter((a) => !prepared.has(a.id));
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold md:text-4xl">{t('title')}</h1>
        <p className="max-w-2xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      {(preps ?? []).length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">{t('mine')}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {(preps ?? []).map((p) => {
              const plan = asPlan(p.plan);
              const total = plan?.topics.length ?? 0;
              const done = p.done.filter((k) => plan?.topics.some((x) => x.key === k)).length;
              return (
                <li key={p.id}>
                  <Link href={`/prep/${p.id}`} data-testid="prep-item" className="brutal brutal-press flex flex-col gap-1.5 p-4">
                    <span className="font-display font-semibold leading-snug [overflow-wrap:anywhere]">{p.applications?.title}</span>
                    <span className="text-sm text-muted-foreground">{p.applications?.company}</span>
                    <span className="flex items-center gap-2 tabular-nums text-xs">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full bg-brand" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                      </span>
                      {t('progress', { done, total })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">{t('candidates')}</h2>
        {candidates.length === 0 ? (
          <p data-testid="prep-no-candidates" className="text-muted-foreground">{t('noCandidates')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {candidates.map((a) => (
              <li key={a.id} data-testid="prep-candidate" className="brutal flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="font-semibold [overflow-wrap:anywhere]">{a.title}</span>
                  <span className="text-muted-foreground"> · {a.company}</span>
                </span>
                <StartPrep applicationId={a.id} auto={a.id === start} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
