-- "Find jobs now": when the user last asked for an immediate search (rate limit lives in the RPC below).
alter table public.profiles add column search_requested_at timestamptz;

-- Returns the new request time, or null when the previous request is younger than 30 minutes.
-- The cooldown is fixed here, not a parameter: callers are end users.
create or replace function public.request_search_now()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
     set search_requested_at = v_now
   where id = v_uid
     and (search_requested_at is null or search_requested_at < v_now - interval '30 minutes');
  if not found then
    return null;
  end if;
  return v_now;
end;
$$;
revoke all on function public.request_search_now() from public, anon;
grant execute on function public.request_search_now() to authenticated;

-- Per-user UI choices (feed filters, kit language…) that must survive reloads and devices.
alter table public.profiles
  add column ui_prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(ui_prefs) = 'object' and pg_column_size(ui_prefs) <= 4096);
grant update (ui_prefs) on public.profiles to authenticated;

-- Progress of the caller's latest "Find jobs now": queries of their active profiles scraped since the request,
-- and matches created since then. Null fields when the user never asked.
create or replace function public.search_now_status()
returns table (requested_at timestamptz, total int, done int, new_matches int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select p.search_requested_at as at from public.profiles p where p.id = auth.uid()),
  q as (
    select distinct sq.id, sq.last_run_at
    from public.search_profiles sp
    join public.search_profile_queries spq on spq.search_profile_id = sp.id
    join public.search_queries sq on sq.id = spq.search_query_id
    join public.sources s on s.id = sq.source_id and s.enabled and (s.paused_until is null or s.paused_until <= now())
    where sp.user_id = auth.uid() and sp.is_active
  )
  select me.at,
         (select count(*)::int from q),
         (select count(*)::int from q where me.at is not null and q.last_run_at >= me.at),
         (select count(*)::int from public.job_matches m where m.user_id = auth.uid() and me.at is not null and m.created_at >= me.at and m.state = 'new')
  from me;
$$;
revoke all on function public.search_now_status() from public, anon;
grant execute on function public.search_now_status() to authenticated;
