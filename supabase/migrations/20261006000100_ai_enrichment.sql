-- Plan 4: AI enrichment of jobs, "why it fits" explanations, the user's country, AI usage accounting.

alter table public.jobs
  add column role text,
  add column remote_regions text[] not null default '{}',
  add column is_job boolean,
  add column enrich_attempts smallint not null default 0;

alter table public.job_matches add column explained_at timestamptz;

alter table public.profiles add column country text
  constraint profiles_country_iso check (country is null or country ~ '^[A-Z]{2}$');
grant update (country) on public.profiles to authenticated;

-- Daily AI request/token counters (UTC day). Service-only: no grants, RLS on without policies.
create table public.ai_usage (
  day date not null,
  sensitivity text not null check (sensitivity in ('public', 'private')),
  model text not null,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, sensitivity, model)
);
revoke all on public.ai_usage from anon, authenticated;
alter table public.ai_usage enable row level security;

create or replace function public.record_ai_usage(
  p_day date, p_sensitivity text, p_model text, p_requests int, p_input bigint, p_output bigint
) returns void language sql security invoker set search_path = '' as $$
  insert into public.ai_usage as u (day, sensitivity, model, requests, input_tokens, output_tokens)
  values (p_day, p_sensitivity, p_model, p_requests, p_input, p_output)
  on conflict (day, sensitivity, model) do update
    set requests = u.requests + excluded.requests,
        input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens
$$;
revoke execute on function public.record_ai_usage(date, text, text, int, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(date, text, text, int, bigint, bigint) to service_role;

-- Jobs worth an AI call: active, never enriched, under 3 failed attempts, and someone still sees a match.
-- Best match first so a limited daily budget goes to what users look at. p_job_ids scopes tests.
create or replace function public.jobs_to_enrich(p_limit int, p_job_ids uuid[] default null)
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select j.id
  from public.jobs j
  join public.job_matches m on m.job_id = j.id and m.state in ('new', 'seen', 'saved')
  where j.status = 'active'
    and j.enriched_at is null
    and j.enrich_attempts < 3
    and (p_job_ids is null or j.id = any (p_job_ids))
  group by j.id
  order by max(m.score) desc, j.first_seen_at desc
  limit p_limit
$$;
revoke execute on function public.jobs_to_enrich(int, uuid[]) from public, anon, authenticated;
grant execute on function public.jobs_to_enrich(int, uuid[]) to service_role;

-- Per user: the best fresh 'new' matches on enriched real jobs that still lack an explanation, limited to what
-- is left of p_per_user after the matches already explained since p_day_start. p_user_ids scopes tests.
create or replace function public.matches_to_explain(
  p_day_start timestamptz, p_per_user int, p_min_score int, p_user_ids uuid[] default null
) returns table (match_id uuid, user_id uuid, locale text)
language sql stable security invoker set search_path = '' as $$
  with done as (
    select m.user_id, count(*)::int as n
    from public.job_matches m
    where m.explained_at >= p_day_start
      and (p_user_ids is null or m.user_id = any (p_user_ids))
    group by m.user_id
  ), ranked as (
    select m.id, m.user_id, p.locale,
           row_number() over (partition by m.user_id order by m.score desc, m.created_at desc) as rn
    from public.job_matches m
    join public.jobs j on j.id = m.job_id
    join public.profiles p on p.id = m.user_id
    where m.state = 'new'
      and m.explained_at is null
      and m.score >= p_min_score
      and m.created_at > now() - interval '3 days'
      and j.status = 'active'
      and j.enriched_at is not null
      and j.is_job is not false
      and (p_user_ids is null or m.user_id = any (p_user_ids))
  )
  select r.id, r.user_id, r.locale
  from ranked r
  left join done d on d.user_id = r.user_id
  where r.rn <= p_per_user - coalesce(d.n, 0)
  order by r.user_id, r.rn
$$;
revoke execute on function public.matches_to_explain(timestamptz, int, int, uuid[]) from public, anon, authenticated;
grant execute on function public.matches_to_explain(timestamptz, int, int, uuid[]) to service_role;
