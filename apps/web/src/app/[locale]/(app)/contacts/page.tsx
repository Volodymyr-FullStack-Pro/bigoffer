import { ExternalLink, UserRound } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { people } from './people';

/** Recruiters and hiring managers from the board: who they are, which applications they are on, when they last wrote. */
export default async function ContactsPage() {
  await requireUserId();
  const t = await getTranslations('contacts');
  const format = await getFormatter();
  const supabase = await createClient();
  const [{ data: apps }, { data: messages }] = await Promise.all([
    supabase.from('applications').select('id, title, company, contact, last_activity_at'),
    supabase.from('application_messages').select('application_id, author, sent_at').eq('direction', 'in').order('sent_at', { ascending: false }).limit(2000),
  ]);
  const list = people(
    (apps ?? []).map((a) => {
      const c = (a.contact ?? {}) as { name?: unknown; url?: unknown };
      return {
        id: a.id,
        title: a.title,
        company: a.company,
        contactName: typeof c.name === 'string' ? c.name : null,
        contactUrl: typeof c.url === 'string' && /^https?:\/\//i.test(c.url) ? c.url : null,
        lastActivityAt: a.last_activity_at,
      };
    }),
    (messages ?? []).map((m) => ({ applicationId: m.application_id, author: m.author, sentAt: m.sent_at })),
  );
  const now = new Date();
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl md:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('intro')}</p>
      </div>
      {list.length === 0 ? (
        <div className="brutal flex max-w-xl flex-col gap-3 p-6">
          <p>{t('empty')}</p>
          <Link href="/board" className="btn brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('toBoard')}</Link>
        </div>
      ) : (
        <ul data-testid="contacts" className="grid gap-3 md:grid-cols-2">
          {list.map((p) => (
            <li key={p.name} data-testid="contact" className="brutal flex flex-col gap-2 p-4">
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <UserRound aria-hidden className="size-4 shrink-0 text-brand" />
                  <span className="truncate">{p.name}</span>
                </span>
                {p.lastAt && <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground tabular-nums">{format.relativeTime(new Date(p.lastAt), now)}</span>}
              </span>
              <ul className="flex flex-col gap-1 text-sm">
                {p.cards.map((c) => (
                  <li key={c.id}>
                    <Link href={`/board?card=${c.id}`} className="hover:underline">
                      <span className="font-medium">{c.company}</span> <span className="text-muted-foreground">· {c.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-xs font-semibold text-link">
                  {t('profile')} <ExternalLink aria-hidden className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
