-- Plan 5: application board (spec 5.6), feed → board actions, card history.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  column_id uuid not null references public.board_columns (id) on delete restrict,
  rank text collate "C" not null,
  title text not null check (char_length(title) between 1 and 300),
  company text not null default '' check (char_length(company) <= 200),
  url text check (url is null or url ~ '^https?://'),
  location text check (char_length(location) <= 200),
  source_id text references public.sources (id),
  salary text check (char_length(salary) <= 120),
  notes text check (char_length(notes) <= 5000),
  contact jsonb not null default '{}',
  applied_at timestamptz,
  next_action_at timestamptz,
  first_response_at timestamptz,
  last_activity_at timestamptz,
  follow_up_count smallint not null default 0,
  outcome text not null default 'open' check (outcome in ('open', 'offer', 'rejected', 'withdrawn', 'ghosted')),
  rejection_stage text check (rejection_stage in ('application', 'screening', 'technical', 'test_task', 'final', 'offer')),
  rejection_by text check (rejection_by in ('company', 'me')),
  rejection_reasons text[] not null default '{}' check (rejection_reasons <@ array[
    'experience_level', 'stack_mismatch', 'english', 'salary_expectations', 'position_closed', 'other_candidate',
    'test_task_failed', 'tech_interview_failed', 'location_timezone', 'culture_fit', 'no_feedback',
    'my_decision_salary', 'my_decision_company', 'other']::text[]),
  rejection_note text check (char_length(rejection_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index applications_user_job on public.applications (user_id, job_id) where job_id is not null;
create index applications_board on public.applications (user_id, column_id, rank);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- A card may only sit in a column of its owner. Invoker rights: under RLS a user only sees own columns.
create or replace function public.applications_check_column()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.board_columns c where c.id = new.column_id and c.user_id = new.user_id) then
    raise exception 'column does not belong to the card owner' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger applications_column_owner before insert or update of column_id, user_id on public.applications
  for each row execute function public.applications_check_column();

create table public.application_labels (
  application_id uuid not null references public.applications (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (application_id, label_id)
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('created', 'moved', 'note', 'label', 'follow_up_sent', 'response', 'outcome')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index application_events_app on public.application_events (application_id, created_at desc);

-- grants
revoke all on public.applications, public.application_labels, public.application_events from anon, authenticated;
grant select, insert, delete on public.applications to authenticated;
grant update (column_id, rank, title, company, url, location, salary, notes, contact, applied_at, next_action_at,
              first_response_at, last_activity_at, follow_up_count, outcome, rejection_stage, rejection_by,
              rejection_reasons, rejection_note)
  on public.applications to authenticated;
grant select, insert, delete on public.application_labels to authenticated;
grant select, insert on public.application_events to authenticated;

-- RLS
alter table public.applications enable row level security;
alter table public.application_labels enable row level security;
alter table public.application_events enable row level security;

create policy "own applications" on public.applications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own application labels" on public.application_labels for all to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
    and exists (select 1 from public.labels l where l.id = label_id and l.user_id = (select auth.uid()))
  );
create policy "own application events select" on public.application_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own application events insert" on public.application_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );

-- Feed → board: snapshot the job into a column and take the match out of the feed. Re-saving reuses the card.
create or replace function public.save_match_to_board(p_match_id uuid, p_column_key text, p_rank text)
returns table (application_id uuid, created boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_col uuid;
  v_app uuid;
begin
  select m.job_id into v_job from public.job_matches m where m.id = p_match_id and m.user_id = v_uid;
  if v_job is null then raise exception 'match not found' using errcode = 'P0002'; end if;
  select c.id into v_col from public.board_columns c where c.user_id = v_uid and c.key = p_column_key;
  if v_col is null then raise exception 'column not found' using errcode = 'P0002'; end if;

  update public.job_matches set state = 'saved' where id = p_match_id;

  select a.id into v_app from public.applications a where a.user_id = v_uid and a.job_id = v_job;
  if v_app is not null then
    return query select v_app, false;
    return;
  end if;

  insert into public.applications (user_id, job_id, column_id, rank, title, company, url, location, source_id, salary, applied_at)
  select v_uid, j.id, v_col, p_rank, left(j.title, 300), left(coalesce(co.name, ''), 200), p.url, left(j.location, 200),
         p.source_id, left(j.salary_raw, 120), case when p_column_key = 'applied' then now() end
  from public.jobs j
  left join public.companies co on co.id = j.company_id
  left join lateral (
    select jp.url, jp.source_id from public.job_postings jp where jp.job_id = j.id order by jp.seen_at desc limit 1
  ) p on true
  where j.id = v_job
  returning id into v_app;

  insert into public.application_events (application_id, user_id, type, payload)
  values (v_app, v_uid, 'created', jsonb_build_object('from', 'feed', 'column', p_column_key));
  return query select v_app, true;
end $$;

-- Undo of a feed action: put the match back and drop the card the action created (if any).
create or replace function public.restore_match(p_match_id uuid, p_application_id uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.job_matches set state = 'new' where id = p_match_id and user_id = (select auth.uid());
  if p_application_id is not null then
    delete from public.applications
    where id = p_application_id and user_id = (select auth.uid())
      and job_id = (select m.job_id from public.job_matches m where m.id = p_match_id);
  end if;
end $$;

create or replace function public.move_application(p_id uuid, p_column_id uuid, p_rank text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from uuid;
  v_kind text;
  v_key text;
begin
  select a.column_id into v_from from public.applications a where a.id = p_id and a.user_id = v_uid;
  if v_from is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  select c.kind, c.key into v_kind, v_key from public.board_columns c where c.id = p_column_id and c.user_id = v_uid;
  if v_kind is null then raise exception 'column not found' using errcode = 'P0002'; end if;
  if v_kind = 'lost' and v_from <> p_column_id then
    raise exception 'use reject_application to move a card to a lost column' using errcode = 'P0001';
  end if;

  update public.applications a set
    column_id = p_column_id,
    rank = p_rank,
    applied_at = case when v_key = 'applied' and a.applied_at is null then now() else a.applied_at end,
    outcome = case when v_kind = 'won' then 'offer' when v_kind = 'active' then 'open' else a.outcome end,
    rejection_stage = case when v_kind = 'active' then null else a.rejection_stage end,
    rejection_by = case when v_kind = 'active' then null else a.rejection_by end,
    rejection_reasons = case when v_kind = 'active' then '{}' else a.rejection_reasons end,
    rejection_note = case when v_kind = 'active' then null else a.rejection_note end
  where a.id = p_id;

  if v_from <> p_column_id then
    insert into public.application_events (application_id, user_id, type, payload)
    values (p_id, v_uid, 'moved', jsonb_build_object('from', v_from, 'to', p_column_id));
  end if;
end $$;

create or replace function public.reject_application(
  p_id uuid, p_column_id uuid, p_rank text, p_stage text, p_by text, p_reasons text[], p_note text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from uuid;
begin
  select a.column_id into v_from from public.applications a where a.id = p_id and a.user_id = v_uid;
  if v_from is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.board_columns c where c.id = p_column_id and c.user_id = v_uid and c.kind = 'lost') then
    raise exception 'not a lost column' using errcode = 'P0001';
  end if;
  update public.applications set
    column_id = p_column_id, rank = p_rank, outcome = 'rejected',
    rejection_stage = p_stage, rejection_by = p_by, rejection_reasons = p_reasons, rejection_note = nullif(p_note, '')
  where id = p_id;
  insert into public.application_events (application_id, user_id, type, payload)
  values (p_id, v_uid, 'outcome', jsonb_build_object('outcome', 'rejected', 'stage', p_stage, 'reasons', p_reasons));
end $$;

revoke execute on function public.save_match_to_board(uuid, text, text) from public, anon;
revoke execute on function public.restore_match(uuid, uuid) from public, anon;
revoke execute on function public.move_application(uuid, uuid, text) from public, anon;
revoke execute on function public.reject_application(uuid, uuid, text, text, text, text[], text) from public, anon;
revoke execute on function public.applications_check_column() from public, anon, authenticated;
grant execute on function public.save_match_to_board(uuid, text, text) to authenticated, service_role;
grant execute on function public.restore_match(uuid, uuid) to authenticated, service_role;
grant execute on function public.move_application(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reject_application(uuid, uuid, text, text, text, text[], text) to authenticated, service_role;
