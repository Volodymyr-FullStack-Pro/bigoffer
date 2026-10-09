-- Expired jobs older than the cutoff are deleted with their postings, matches (incl. hidden ones) and apply kits
-- (all on delete cascade). Jobs on anyone's board are kept: their cards and apply kits must survive.
create or replace function public.purge_expired_jobs(p_cutoff timestamptz, p_limit int default 5000)
returns int
language sql
security definer
set search_path = ''
as $$
  with doomed as (
    select j.id from public.jobs j
    where j.status = 'expired'
      and j.last_seen_at < p_cutoff
      and not exists (select 1 from public.applications a where a.job_id = j.id)
    limit p_limit
  ), gone as (
    delete from public.jobs j using doomed d where j.id = d.id returning 1
  )
  select count(*)::int from gone;
$$;
revoke all on function public.purge_expired_jobs(timestamptz, int) from public, anon, authenticated;
grant execute on function public.purge_expired_jobs(timestamptz, int) to service_role;
