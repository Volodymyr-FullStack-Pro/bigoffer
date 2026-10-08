begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public', 'jobs', 'remote_regions', 'jobs.remote_regions exists');
select has_column('public', 'jobs', 'is_job', 'jobs.is_job exists');
select has_column('public', 'job_matches', 'explained_at', 'job_matches.explained_at exists');

insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'ai-a@test.dev');
insert into public.companies (id, name, normalized_name)
  values ('a4000000-0000-0000-0000-000000000001', 'AI Co', 'ai co plan4 test');
insert into public.jobs (id, fingerprint, title, company_id, enriched_at, enrich_attempts, is_job) values
  ('b4000000-0000-0000-0000-000000000001', 'p4-1', 'Fresh', 'a4000000-0000-0000-0000-000000000001', null, 0, null),
  ('b4000000-0000-0000-0000-000000000002', 'p4-2', 'Hidden only', 'a4000000-0000-0000-0000-000000000001', null, 0, null),
  ('b4000000-0000-0000-0000-000000000003', 'p4-3', 'Enriched top', 'a4000000-0000-0000-0000-000000000001', now(), 0, true),
  ('b4000000-0000-0000-0000-000000000004', 'p4-4', 'Gave up', 'a4000000-0000-0000-0000-000000000001', null, 3, null),
  ('b4000000-0000-0000-0000-000000000005', 'p4-5', 'Not a job', 'a4000000-0000-0000-0000-000000000001', now(), 0, false),
  ('b4000000-0000-0000-0000-000000000006', 'p4-6', 'Enriched second', 'a4000000-0000-0000-0000-000000000001', now(), 0, true),
  ('b4000000-0000-0000-0000-000000000007', 'p4-7', 'Explained today', 'a4000000-0000-0000-0000-000000000001', now(), 0, true);
insert into public.job_matches (user_id, job_id, score, state, explained_at) values
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000001', 90, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000002', 95, 'hidden', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000003', 80, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000004', 70, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000005', 99, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000006', 75, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000007', 60, 'new', now());

select is(
  (select array_agg(id) from public.jobs_to_enrich(10, array[
     'b4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000002',
     'b4000000-0000-0000-0000-000000000003', 'b4000000-0000-0000-0000-000000000004']::uuid[]) as id),
  array['b4000000-0000-0000-0000-000000000001']::uuid[],
  'only active, unenriched jobs with a visible match and attempts left');

select public.record_ai_usage('2026-10-06', 'public', 'pgtap-model', 1, 100, 20);
select public.record_ai_usage('2026-10-06', 'public', 'pgtap-model', 2, 50, 5);
select results_eq(
  $$ select requests, input_tokens::int, output_tokens::int from public.ai_usage where model = 'pgtap-model' $$,
  $$ values (3, 150, 25) $$,
  'usage accumulates per day, sensitivity and model');

select results_eq(
  $$ select j.title from public.matches_to_explain(date_trunc('day', now()), 2, 50,
       array['66666666-6666-6666-6666-666666666666']::uuid[]) e
     join public.job_matches m on m.id = e.match_id
     join public.jobs j on j.id = m.job_id $$,
  $$ values ('Enriched top'::text) $$,
  'best unexplained enriched real job, within what is left of the daily per-user budget');

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select lives_ok($$ update public.profiles set country = 'UA' where id = '66666666-6666-6666-6666-666666666666' $$,
  'a user sets their own country');
select throws_ok($$ update public.profiles set country = 'ukraine' where id = '66666666-6666-6666-6666-666666666666' $$,
  '23514', null, 'country must be an ISO alpha-2 code');
select throws_ok($$ select * from public.ai_usage $$, '42501', null, 'ai_usage is service-only');
select throws_ok($$ select public.record_ai_usage(current_date, 'public', 'x', 1, 0, 0) $$,
  '42501', null, 'record_ai_usage is service-only');
select throws_ok($$ select * from public.jobs_to_enrich(1) $$, '42501', null, 'jobs_to_enrich is service-only');

reset role;
select is((select country from public.profiles where id = '66666666-6666-6666-6666-666666666666'), 'UA',
  'country is stored');

select * from finish();
rollback;
