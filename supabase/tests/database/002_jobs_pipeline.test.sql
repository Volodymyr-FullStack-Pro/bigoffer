begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

insert into public.companies (id, name, normalized_name)
  values ('c0000000-0000-0000-0000-000000000001', 'Acme', 'acme');
insert into public.jobs (id, fingerprint, title, company_id)
  values ('d0000000-0000-0000-0000-000000000001', 'fp-1', 'Senior React Developer',
          'c0000000-0000-0000-0000-000000000001');
insert into public.job_postings (job_id, source_id, external_id, url)
  values ('d0000000-0000-0000-0000-000000000001', 'dou', '1', 'https://jobs.dou.ua/x/1/');
insert into public.job_matches (user_id, job_id, score) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 80),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 50);
insert into public.search_profiles (id, user_id, name, keywords) values
  ('e0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B', '{react}');

-- service-side helpers
select is(public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'Senior React Developer.'),
  'd0000000-0000-0000-0000-000000000001'::uuid, 'find_similar_job finds near-identical title');
select is(public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'Accountant'),
  null::uuid, 'find_similar_job ignores different title');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.jobs where id = 'd0000000-0000-0000-0000-000000000001'), 1, 'reads global jobs');
select is((select count(*)::int from public.job_postings where job_id = 'd0000000-0000-0000-0000-000000000001'), 1, 'reads global postings');
select is((select count(*)::int from public.job_matches), 1, 'sees only own matches');
select is((select score::int from public.job_matches), 80, 'own match score visible');
select lives_ok($$ update public.job_matches set state = 'hidden' where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'can change own match state');
select is((select state from public.job_matches), 'hidden', 'state updated');
select throws_ok($$ update public.job_matches set score = 100 $$, '42501', null, 'cannot change score');
select throws_ok($$ insert into public.job_matches (user_id, job_id, score)
  values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 1) $$,
  '42501', null, 'cannot insert matches');
select throws_ok($$ select * from public.search_queries $$, '42501', null, 'search_queries are service-only');
select throws_ok($$ select public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'cannot execute find_similar_job');
select lives_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'Mine', '{full stack}') $$, 'can create own search profile');
select is((select count(*)::int from public.search_profiles), 1, 'sees only own search profiles');
select throws_ok($$ insert into public.search_profiles (user_id, name)
  values ('22222222-2222-2222-2222-222222222222', 'Evil') $$, '42501', null, 'cannot create profile for another user');

reset role;
set local role anon;
select throws_ok($$ select * from public.jobs $$, '42501', null, 'anon cannot read jobs');

select * from finish();
rollback;
