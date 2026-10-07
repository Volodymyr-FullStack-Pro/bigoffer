-- Plan 5 final-review follow-ups: ghosted/withdrawn outcomes, race-safe save, atomic ping, events index.

create index application_events_user on public.application_events (user_id);

-- Replace the 7-arg signature so the generated client types expose a single function.
drop function public.reject_application(uuid, uuid, text, text, text, text[], text);
create or replace function public.reject_application(
  p_id uuid, p_column_id uuid, p_rank text, p_stage text, p_by text, p_reasons text[], p_note text,
  p_outcome text default 'rejected'
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from uuid;
begin
  if p_outcome is null or p_outcome not in ('rejected', 'ghosted', 'withdrawn') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  select a.column_id into v_from from public.applications a where a.id = p_id and a.user_id = v_uid;
  if v_from is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.board_columns c where c.id = p_column_id and c.user_id = v_uid and c.kind = 'lost') then
    raise exception 'not a lost column' using errcode = 'P0001';
  end if;
  update public.applications set
    column_id = p_column_id, rank = p_rank, outcome = p_outcome,
    rejection_stage = p_stage, rejection_by = p_by, rejection_reasons = p_reasons, rejection_note = nullif(p_note, '')
  where id = p_id;
  insert into public.application_events (application_id, user_id, type, payload)
  values (p_id, v_uid, 'outcome', jsonb_build_object('outcome', p_outcome, 'stage', p_stage, 'reasons', p_reasons));
end $$;

revoke execute on function public.reject_application(uuid, uuid, text, text, text, text[], text, text) from public, anon;
grant execute on function public.reject_application(uuid, uuid, text, text, text, text[], text, text) to authenticated, service_role;

-- Concurrent double-save: the unique (user_id, job_id) index decides; the loser reuses the winner's card.
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

  insert into public.applications (user_id, job_id, column_id, rank, title, company, url, location, source_id, salary, applied_at)
  select v_uid, j.id, v_col, p_rank, left(j.title, 300), left(coalesce(co.name, ''), 200), p.url, left(j.location, 200),
         p.source_id, left(j.salary_raw, 120), case when p_column_key = 'applied' then now() end
  from public.jobs j
  left join public.companies co on co.id = j.company_id
  left join lateral (
    select jp.url, jp.source_id from public.job_postings jp where jp.job_id = j.id order by jp.seen_at desc limit 1
  ) p on true
  where j.id = v_job
  on conflict (user_id, job_id) where job_id is not null do nothing
  returning id into v_app;

  if v_app is null then
    select a.id into v_app from public.applications a where a.user_id = v_uid and a.job_id = v_job;
    return query select v_app, false;
    return;
  end if;

  insert into public.application_events (application_id, user_id, type, payload)
  values (v_app, v_uid, 'created', jsonb_build_object('from', 'feed', 'column', p_column_key));
  return query select v_app, true;
end $$;

revoke execute on function public.save_match_to_board(uuid, text, text) from public, anon;
grant execute on function public.save_match_to_board(uuid, text, text) to authenticated, service_role;

-- Atomic "I pinged them": counter + timer restart + history in one statement.
create or replace function public.ping_application(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_count smallint;
begin
  update public.applications set follow_up_count = follow_up_count + 1, last_activity_at = now()
  where id = p_id and user_id = v_uid
  returning follow_up_count into v_count;
  if v_count is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  insert into public.application_events (application_id, user_id, type, payload)
  values (p_id, v_uid, 'follow_up_sent', jsonb_build_object('count', v_count));
end $$;

revoke execute on function public.ping_application(uuid) from public, anon;
grant execute on function public.ping_application(uuid) to authenticated, service_role;
