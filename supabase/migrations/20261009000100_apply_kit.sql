-- Plan 6a: CV, answer bank, letter templates, apply kits, outgoing recruiter messages (spec 5.5, 5.6, 7.2, 12.4).

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  parsed jsonb,
  parse_error text check (char_length(parse_error) <= 500),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  constraint resumes_path_owner check (storage_path like user_id::text || '/%')
);
create unique index resumes_one_primary on public.resumes (user_id) where is_primary;

create table public.answer_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  question text not null check (char_length(question) between 1 and 300),
  answer jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create trigger answer_bank_updated_at before update on public.answer_bank
  for each row execute function public.set_updated_at();

create table public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  locale text not null check (locale in ('uk', 'ru', 'en')),
  body text not null check (char_length(body) between 1 and 5000),
  updated_at timestamptz not null default now(),
  unique (user_id, locale)
);
create trigger letter_templates_updated_at before update on public.letter_templates
  for each row execute function public.set_updated_at();

create table public.apply_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}$'),
  requirements jsonb not null default '[]',
  red_flags text[] not null default '{}',
  cover_letter text not null check (char_length(cover_letter) <= 6000),
  short_message text not null check (char_length(short_message) <= 500),
  salary_hint text check (char_length(salary_hint) <= 300),
  form_answers jsonb not null default '[]',
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create trigger apply_kits_updated_at before update on public.apply_kits
  for each row execute function public.set_updated_at();

create table public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  channel text not null check (channel in ('email', 'linkedin', 'djinni', 'telegram', 'call', 'other')),
  author text check (char_length(author) <= 200),
  body text not null check (char_length(body) between 1 and 10000),
  sent_at timestamptz not null default now(),
  ai_classification text check (ai_classification in ('rejection', 'interview_invite', 'test_task', 'question', 'offer', 'other')),
  ai_extracted jsonb
);
create index application_messages_app on public.application_messages (application_id, sent_at desc);

alter table public.applications
  add column letter_used text check (char_length(letter_used) <= 6000),
  add column letter_kind text check (letter_kind in ('full', 'short', 'none'));
grant update (letter_used, letter_kind) on public.applications to authenticated;

alter table public.application_events drop constraint application_events_type_check;
alter table public.application_events add constraint application_events_type_check
  check (type in ('created', 'moved', 'note', 'label', 'follow_up_sent', 'response', 'outcome', 'message'));

-- grants
revoke all on public.resumes, public.answer_bank, public.letter_templates, public.apply_kits, public.application_messages
  from anon, authenticated;
grant select, insert, delete on public.resumes to authenticated;
grant update (file_name, parsed, parse_error, is_primary) on public.resumes to authenticated;
grant select, insert, update, delete on public.answer_bank, public.letter_templates to authenticated;
grant select, insert, delete on public.apply_kits to authenticated;
grant update (lang, requirements, red_flags, cover_letter, short_message, salary_hint, form_answers, generated_at)
  on public.apply_kits to authenticated;
grant select, insert, delete on public.application_messages to authenticated;

-- RLS
alter table public.resumes enable row level security;
alter table public.answer_bank enable row level security;
alter table public.letter_templates enable row level security;
alter table public.apply_kits enable row level security;
alter table public.application_messages enable row level security;

create policy "own resumes" on public.resumes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own answers" on public.answer_bank for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own templates" on public.letter_templates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own kits" on public.apply_kits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own messages" on public.application_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );

-- Private CV bucket: each user owns the folder named after their id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "own cv files read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
