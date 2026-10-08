begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-00000000000a', 'board-a@test.dev'),
  ('a5000000-0000-0000-0000-00000000000b', 'board-b@test.dev');
insert into public.companies (id, name, normalized_name)
  values ('c5000000-0000-0000-0000-000000000001', 'Board Co', 'board co plan5 test');
insert into public.jobs (id, fingerprint, title, company_id)
  values ('d5000000-0000-0000-0000-000000000001', 'p5-1', 'Full Stack Dev', 'c5000000-0000-0000-0000-000000000001');
insert into public.job_postings (job_id, source_id, external_id, url)
  values ('d5000000-0000-0000-0000-000000000001', 'dou', 'p5-1', 'https://jobs.dou.ua/vacancies/p5-1/');
insert into public.job_matches (id, user_id, job_id, score)
  values ('e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-000000000001', 88);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$ select created from public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'saved', 'a0') $$,
  $$ values (true) $$, 'saving a match creates an application');
select is((select state from public.job_matches where id = 'e5000000-0000-0000-0000-000000000001'), 'saved', 'match state becomes saved');
select results_eq(
  $$ select a.title, a.company, a.url, a.source_id, c.key from public.applications a join public.board_columns c on c.id = a.column_id $$,
  $$ values ('Full Stack Dev'::text, 'Board Co'::text, 'https://jobs.dou.ua/vacancies/p5-1/'::text, 'dou'::text, 'saved'::text) $$,
  'snapshot of the job in the Saved column');
select results_eq(
  $$ select created from public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'applied', 'a1') $$,
  $$ values (false) $$, 'saving again reuses the application');
select is((select count(*)::int from public.application_events where type = 'created'), 1, 'one created event');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'applied'), 'a2');
select isnt((select applied_at from public.applications), null, 'moving to Applied stamps applied_at');
select is((select count(*)::int from public.application_events where type = 'moved'), 1, 'move is recorded');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'offer'), 'a3');
select is((select outcome from public.applications), 'offer', 'won column sets outcome offer');

select throws_ok(
  $$ select public.move_application((select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a4') $$,
  'P0001', null, 'lost column needs reject_application');
select public.reject_application(
  (select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a4',
  'technical', 'company', array['english', 'stack_mismatch'], 'weak English');
select results_eq(
  $$ select outcome, rejection_stage, rejection_by, rejection_reasons from public.applications $$,
  $$ values ('rejected'::text, 'technical'::text, 'company'::text, array['english', 'stack_mismatch']::text[]) $$,
  'rejection is stored');
select throws_ok(
  $$ select public.reject_application((select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a5', 'technical', 'company', array['nope'], '') $$,
  '23514', null, 'unknown rejection reason is refused');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'offer'), 'a5');
select results_eq(
  $$ select outcome, rejection_stage, rejection_reasons from public.applications $$,
  $$ values ('offer'::text, null::text, '{}'::text[]) $$,
  'moving a rejected card to the won column clears rejection data');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'interview'), 'a6');
select results_eq(
  $$ select outcome, rejection_stage, rejection_reasons from public.applications $$,
  $$ values ('open'::text, null::text, '{}'::text[]) $$,
  'moving back to an active column reopens the card');

-- ghosted / invalid outcome / atomic ping
select public.reject_application(
  (select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a7',
  'application', 'company', array['no_feedback'], '', 'ghosted');
select results_eq(
  $$ select outcome from public.applications $$, $$ values ('ghosted'::text) $$, 'ghosted outcome is stored');
select is((select count(*)::int from public.application_events where type = 'outcome' and payload ->> 'outcome' = 'ghosted'), 1, 'event carries the outcome');
select throws_ok(
  $$ select public.reject_application((select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a8', 'application', 'company', array['no_feedback'], '', 'bogus') $$,
  '22023', null, 'invalid outcome is refused');
select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'applied'), 'a8');
select public.ping_application((select id from public.applications));
select results_eq(
  $$ select follow_up_count::int, last_activity_at is not null from public.applications $$,
  $$ values (1, true) $$, 'ping increments the counter and restarts the timer');
select is((select count(*)::int from public.application_events where type = 'follow_up_sent'), 1, 'ping is recorded');

select public.restore_match('e5000000-0000-0000-0000-000000000001', (select id from public.applications));
select is((select count(*)::int from public.applications), 0, 'restore deletes the created application');
select is((select state from public.job_matches where id = 'e5000000-0000-0000-0000-000000000001'), 'new', 'restore returns the match to the feed');

-- A saves the match again so the card exists while B probes it.
select public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'saved', 'a0');
select set_config('test.app_a', (select id::text from public.applications), true);
-- Remember one of A's columns while still acting as A (B cannot see it under RLS).
select set_config('test.col_a', (select id::text from public.board_columns where key = 'saved'), true);
set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$ insert into public.applications (user_id, column_id, rank, title)
     values ('a5000000-0000-0000-0000-00000000000b', current_setting('test.col_a')::uuid, 'a0', 'x') $$,
  'P0001', null, 'a card cannot use another user''s column');
select throws_ok(
  $$ select public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'saved', 'a0') $$,
  'P0002', null, 'another user''s match is not found');

select throws_ok(
  $$ insert into public.application_labels (application_id, label_id)
     values (current_setting('test.app_a')::uuid, (select id from public.labels limit 1)) $$,
  '42501', null, 'cannot label another user''s card');
select throws_ok(
  $$ insert into public.application_events (application_id, user_id, type)
     values (current_setting('test.app_a')::uuid, 'a5000000-0000-0000-0000-00000000000b', 'note') $$,
  '42501', null, 'cannot write history of another user''s card');
select is((select count(*)::int from public.applications) + (select count(*)::int from public.application_events), 0,
  'another user''s cards and history are invisible');
select throws_ok(
  $$ select public.move_application(current_setting('test.app_a')::uuid, (select id from public.board_columns where key = 'applied'), 'a9') $$,
  'P0002', null, 'cannot move another user''s card');
select throws_ok(
  $$ select public.reject_application(current_setting('test.app_a')::uuid, (select id from public.board_columns where key = 'rejected'), 'a9', 'technical', 'company', array['english'], '') $$,
  'P0002', null, 'cannot reject another user''s card');
select public.restore_match('e5000000-0000-0000-0000-000000000001', current_setting('test.app_a')::uuid);
set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.applications), 1, 'another user''s restore leaves the card alone');

select * from finish();
rollback;
