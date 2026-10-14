-- Library: links the user keeps (articles, visualizers, docs) by topic.
create table public.saved_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 1000),
  title text not null check (char_length(title) between 1 and 300),
  topic text not null default 'other' check (char_length(topic) between 1 and 40),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index saved_links_user on public.saved_links (user_id, created_at desc);

-- Interview prep for one board card: the plan (role, expectations, topics), lessons written per topic on demand,
-- the "how to tell them about me" pitch from the CV, and the topics marked learned.
create table public.interview_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid not null unique references public.applications (id) on delete cascade,
  lang text not null check (lang in ('uk', 'ru', 'en')),
  plan jsonb not null,
  lessons jsonb not null default '{}',
  pitch jsonb,
  done text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interview_preps_user on public.interview_preps (user_id, updated_at desc);
create trigger interview_preps_updated_at before update on public.interview_preps
  for each row execute function public.set_updated_at();

grant select, insert, delete on public.saved_links to authenticated;
grant update (title, topic, note) on public.saved_links to authenticated;
grant select, insert, delete on public.interview_preps to authenticated;
grant update (lang, plan, lessons, pitch, done) on public.interview_preps to authenticated;

alter table public.saved_links enable row level security;
alter table public.interview_preps enable row level security;

create policy "own links" on public.saved_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own preps" on public.interview_preps for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );
