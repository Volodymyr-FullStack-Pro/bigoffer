-- Market pay for a role and level: the stated salaries of jobs first seen in the last 60 days. Jobs are RLS-protected,
-- so this definer function hands signed-in users only title, role, level and the monthly USD midpoint.
create or replace function public.salary_points()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('t', j.title, 'r', j.role, 's', j.seniority, 'v',
    round((coalesce(j.salary_min_usd, j.salary_max_usd) + coalesce(j.salary_max_usd, j.salary_min_usd)) / 2.0))), '[]'::jsonb)
  from public.jobs j
  where j.first_seen_at > now() - interval '60 days'
    and j.is_job is not false
    and (j.salary_min_usd is not null or j.salary_max_usd is not null)
    and coalesce(j.salary_min_usd, j.salary_max_usd) between 200 and 20000
$$;

revoke execute on function public.salary_points() from public, anon;
grant execute on function public.salary_points() to authenticated;
