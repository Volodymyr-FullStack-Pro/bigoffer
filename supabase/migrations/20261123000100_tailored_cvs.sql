-- A CV rewritten for one job: the user's own facts reordered and reworded for it, with each change marked so the user
-- sees what was strengthened and what the CV does not back before sending it. One per user and job.
create table public.tailored_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}$'),
  cv jsonb not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create trigger tailored_cvs_updated_at before update on public.tailored_cvs
  for each row execute function public.set_updated_at();

revoke all on public.tailored_cvs from anon, authenticated;
grant select, insert, delete on public.tailored_cvs to authenticated;
grant update (lang, cv, generated_at) on public.tailored_cvs to authenticated;

alter table public.tailored_cvs enable row level security;
create policy "own tailored cvs" on public.tailored_cvs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
