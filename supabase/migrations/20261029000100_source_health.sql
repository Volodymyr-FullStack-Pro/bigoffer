-- Hourly data-quality check per board: a board can keep "succeeding" while it collects half-empty jobs (the DOU
-- salary went to the location for weeks). The metrics come from here; the thresholds live in the jobs app.
create or replace function public.source_health(p_now timestamptz default now())
returns table (
  source_id text,
  runs_6h int,
  ok_runs_6h int,
  blocked_runs_6h int,
  found_6h int,
  last_ok_run_at timestamptz,
  new_jobs_24h int,
  pct_company int,
  pct_description int,
  pct_posted int,
  pct_location int,
  pct_salary int,
  newest_posted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with runs as (
    select r.source_id,
           count(*) filter (where r.started_at > p_now - interval '6 hours') as runs_6h,
           count(*) filter (where r.started_at > p_now - interval '6 hours' and r.status = 'ok') as ok_runs_6h,
           count(*) filter (where r.started_at > p_now - interval '6 hours' and r.status = 'blocked') as blocked_runs_6h,
           coalesce(sum(r.found) filter (where r.started_at > p_now - interval '6 hours'), 0) as found_6h,
           max(r.started_at) filter (where r.status = 'ok') as last_ok_run_at
      from source_runs r
     where r.started_at > p_now - interval '7 days'
     group by r.source_id
  ),
  fresh as (
    select p.source_id, j.*
      from jobs j
      join lateral (select pp.source_id from job_postings pp where pp.job_id = j.id order by pp.seen_at limit 1) p on true
     where j.first_seen_at > p_now - interval '24 hours'
  ),
  quality as (
    select f.source_id,
           count(*) as n,
           count(*) filter (where not f.company_is_placeholder) as company,
           count(*) filter (where length(coalesce(f.description_text, '')) >= 300) as description,
           count(*) filter (where f.posted_at is not null) as posted,
           count(*) filter (where nullif(f.location, '') is not null) as location,
           count(*) filter (where f.salary_min_usd is not null or f.salary_max_usd is not null) as salary,
           max(f.posted_at) as newest_posted_at
      from fresh f
     group by f.source_id
  )
  select s.id,
         coalesce(r.runs_6h, 0)::int, coalesce(r.ok_runs_6h, 0)::int, coalesce(r.blocked_runs_6h, 0)::int,
         coalesce(r.found_6h, 0)::int, r.last_ok_run_at,
         coalesce(q.n, 0)::int,
         case when q.n > 0 then (100 * q.company / q.n)::int end,
         case when q.n > 0 then (100 * q.description / q.n)::int end,
         case when q.n > 0 then (100 * q.posted / q.n)::int end,
         case when q.n > 0 then (100 * q.location / q.n)::int end,
         case when q.n > 0 then (100 * q.salary / q.n)::int end,
         q.newest_posted_at
    from sources s
    left join runs r on r.source_id = s.id
    left join quality q on q.source_id = s.id
   where s.enabled
   order by s.id;
$$;

-- Open matches still waiting for AI enrichment an hour after the job was found (the enrichment job is stuck).
create or replace function public.enrich_backlog(p_now timestamptz default now())
returns int language sql stable security definer set search_path = public as $$
  select count(distinct j.id)::int
    from jobs j
    join job_matches m on m.job_id = j.id and m.state in ('new', 'seen', 'saved')
   where j.status = 'active' and j.enriched_at is null and j.enrich_attempts < 3
     and j.first_seen_at < p_now - interval '1 hour';
$$;

revoke all on function public.source_health(timestamptz) from public, anon, authenticated;
revoke all on function public.enrich_backlog(timestamptz) from public, anon, authenticated;

-- One alert per distinct problem per day, not one every hour.
create table public.health_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.health_alerts enable row level security;
