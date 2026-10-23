-- "Actively hiring": how many active jobs each company posted in the last 30 days. Definer, so a user learns only the
-- counts for the companies they ask about, never other users' data.
create or replace function public.company_open_jobs(p_company_ids uuid[])
returns table (company_id uuid, n int) language sql stable security definer set search_path = '' as $$
  select j.company_id, count(*)::int
  from public.jobs j
  where j.company_id = any (p_company_ids)
    and j.status = 'active'
    and j.is_job is not false
    and j.first_seen_at > now() - interval '30 days'
  group by j.company_id
$$;

revoke execute on function public.company_open_jobs(uuid[]) from public, anon;
grant execute on function public.company_open_jobs(uuid[]) to authenticated;
