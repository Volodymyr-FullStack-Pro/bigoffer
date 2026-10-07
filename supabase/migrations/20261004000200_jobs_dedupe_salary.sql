-- F3: a salary range is never reversed. Repair existing rows first.
update public.jobs
  set salary_min_usd = least(salary_min_usd, salary_max_usd),
      salary_max_usd = greatest(salary_min_usd, salary_max_usd)
  where salary_min_usd > salary_max_usd;
alter table public.jobs add constraint jobs_salary_range
  check (salary_min_usd is null or salary_max_usd is null or salary_min_usd <= salary_max_usd);

-- F5: fuzzy dedupe compares canonical titles (normalizeTitle: "C++" -> "cplusplus", "C#" -> "csharp", ...),
-- so symbol-only differences no longer look identical to pg_trgm. Old rows get lower(title) as a best effort.
alter table public.jobs add column title_normalized text;
update public.jobs set title_normalized = lower(title) where title_normalized is null;

create or replace function public.find_similar_job(p_company_id uuid, p_title text)
returns uuid language sql stable set search_path = '' as $$
  select j.id
  from public.jobs j
  where j.company_id = p_company_id
    and j.first_seen_at > now() - interval '14 days'
    and extensions.similarity(coalesce(j.title_normalized, lower(j.title)), p_title) > 0.9
  order by extensions.similarity(coalesce(j.title_normalized, lower(j.title)), p_title) desc
  limit 1
$$;
revoke execute on function public.find_similar_job(uuid, text) from public, anon, authenticated;
grant execute on function public.find_similar_job(uuid, text) to service_role;
