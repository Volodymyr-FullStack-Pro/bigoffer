-- Plan 8: per-user daily cap on paid (private) AI calls. Counts attempts, checked before the LLM call.
create table public.ai_user_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0 check (requests >= 0),
  primary key (user_id, day)
);
revoke all on public.ai_user_usage from anon, authenticated;
alter table public.ai_user_usage enable row level security;

-- Security definer: users have no table rights; the function only ever touches the caller's own row (auth.uid()),
-- so calling it directly can only spend the caller's own quota. The LLM call itself happens server-side.
create or replace function public.consume_private_ai(p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_requests int;
begin
  if v_user is null or p_limit is null or p_limit <= 0 then
    return false;
  end if;
  insert into public.ai_user_usage as u (user_id, day, requests)
  values (v_user, v_day, 1)
  on conflict (user_id, day) do update set requests = u.requests + 1
    where u.requests < p_limit
  returning requests into v_requests;
  return v_requests is not null;
end;
$$;
revoke execute on function public.consume_private_ai(int) from public, anon;
grant execute on function public.consume_private_ai(int) to authenticated;
