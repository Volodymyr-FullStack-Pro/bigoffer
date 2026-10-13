-- Start clean with DOU, Djinni and robota.ua only (owner's decision 2026-10-13): everything that came from the
-- retired boards goes — their applications, jobs, postings, companies left without jobs, and the source rows.
create temp table kept (id text primary key) on commit drop;
insert into kept values ('dou'), ('djinni'), ('robotaua');

delete from public.applications where source_id is not null and source_id not in (select id from kept);
delete from public.jobs j
 where not exists (select 1 from public.job_postings p where p.job_id = j.id and p.source_id in (select id from kept));
delete from public.job_postings where source_id not in (select id from kept);
delete from public.companies c where not exists (select 1 from public.jobs j where j.company_id = c.id);
delete from public.source_runs where source_id not in (select id from kept);
delete from public.search_queries where source_id not in (select id from kept);
delete from public.source_boards;
delete from public.sources where id not in (select id from kept);
