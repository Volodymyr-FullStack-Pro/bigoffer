-- Boards that never yielded a useful match in production (or never ran): their adapters are gone, so the scheduler
-- must not pick their queries. Rows stay (jobs and postings still reference them); nothing is deleted.
update public.sources set enabled = false
 where id in ('olx', 'jobico', 'arbeitnow', 'justjoin', 'jobicy', 'wwr', 'adzuna');
