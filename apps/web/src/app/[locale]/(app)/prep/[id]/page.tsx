import type { PrepLesson, PrepPitch } from '@jp/ai';
import { notFound } from 'next/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { asPlan } from '../prep-types';
import { PrepView } from './prep-view';

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PrepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUserId();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: prep } = await supabase
    .from('interview_preps')
    .select('id, plan, lessons, pitch, done, applications(id, title, company, url, next_action_at, contact)')
    .eq('id', id)
    .maybeSingle();
  const plan = prep ? asPlan(prep.plan) : null;
  if (!prep || !plan || !prep.applications) notFound();
  const app = prep.applications;
  const meet = (app.contact ?? {}) as { meet?: unknown };
  return (
    <PrepView
      prepId={prep.id}
      card={{ title: app.title, company: app.company ?? '', url: app.url, interviewAt: app.next_action_at, meetingUrl: typeof meet.meet === 'string' ? meet.meet : null }}
      plan={plan}
      lessons={(prep.lessons ?? {}) as Record<string, PrepLesson>}
      pitch={(prep.pitch ?? null) as PrepPitch | null}
      done={prep.done}
    />
  );
}
