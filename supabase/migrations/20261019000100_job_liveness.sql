-- When a job's posting was last checked as still open on its board (DOU / Djinni / robota.ua), so closed vacancies
-- leave the feed within hours instead of after 14 days of absence from search results.
alter table public.jobs add column live_checked_at timestamptz;
create index jobs_live_checked on public.jobs (live_checked_at nulls first) where status = 'active';
