-- The public landing shows how much the boards publish and the freshest postings (title, company, board). Jobs are
-- RLS-protected, so this definer function hands anonymous visitors only those public fields, never matches or users.
create or replace function public.public_landing_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  with fresh as (
    select j.id, j.title, c.name as company, j.company_is_placeholder, j.first_seen_at,
           (select p.source_id from public.job_postings p where p.job_id = j.id order by p.seen_at limit 1) as source_id
    from public.jobs j
    join public.companies c on c.id = j.company_id
    where j.status = 'active'
      and j.is_job is not false
      and j.first_seen_at > now() - interval '7 days'
  )
  select jsonb_build_object(
    'day', (select count(*) from fresh where first_seen_at > now() - interval '24 hours'),
    'week', (select count(*) from fresh),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('title', r.title, 'company', r.company, 'source', r.source_id, 'at', r.first_seen_at))
      from (
        select title, company, source_id, first_seen_at
        from fresh
        where not coalesce(company_is_placeholder, false)
        order by first_seen_at desc
        limit 24
      ) r
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.public_landing_stats() from public;
grant execute on function public.public_landing_stats() to anon, authenticated;
