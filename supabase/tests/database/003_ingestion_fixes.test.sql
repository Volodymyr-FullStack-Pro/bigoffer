begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev');

insert into public.companies (id, name, normalized_name)
  values ('c0000000-0000-0000-0000-000000000001', 'Acme', 'acme');
insert into public.jobs (id, fingerprint, title, title_normalized, company_id) values
  ('d0000000-0000-0000-0000-000000000001', 'fp-1', 'Senior C++ Developer', 'senior cplusplus developer',
   'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'fp-2', 'Seen job', 'seen job', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'fp-3', 'User hidden', 'user hidden', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'fp-4', 'Excluded', 'excluded', 'c0000000-0000-0000-0000-000000000001');
insert into public.search_profiles (id, user_id, name, keywords) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'P1', '{c++}');

-- ---------- F5: canonical-title dedupe ----------
select is(public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'senior cplusplus developer'),
  'd0000000-0000-0000-0000-000000000001'::uuid, 'find_similar_job matches the canonical title');
select is(public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'senior csharp developer'),
  null::uuid, 'C# is not similar to C++');

-- ---------- F3: salary range ----------
select throws_ok($$ insert into public.jobs (fingerprint, title, company_id, salary_min_usd, salary_max_usd)
  values ('fp-bad', 'x', 'c0000000-0000-0000-0000-000000000001', 5000, 3000) $$, '23514', null,
  'reversed salary range is rejected');

-- ---------- F1: upsert_job_matches ----------
insert into public.job_matches (user_id, job_id, search_profile_id, score, breakdown, state) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000001', 50, '{"excludedBy":null}', 'seen'),
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000003',
   'e0000000-0000-0000-0000-000000000001', 50, '{"excludedBy":null}', 'hidden'),
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000004',
   'e0000000-0000-0000-0000-000000000001', 50, '{"excludedBy":"php"}', 'hidden');

select lives_ok($$ select public.upsert_job_matches('[
  {"user_id":"11111111-1111-1111-1111-111111111111","job_id":"d0000000-0000-0000-0000-000000000001",
   "search_profile_id":"e0000000-0000-0000-0000-000000000001","score":60,"breakdown":{"excludedBy":null},"state":"new"},
  {"user_id":"11111111-1111-1111-1111-111111111111","job_id":"d0000000-0000-0000-0000-000000000002",
   "search_profile_id":"e0000000-0000-0000-0000-000000000001","score":90,"breakdown":{"excludedBy":null},"state":"new"},
  {"user_id":"11111111-1111-1111-1111-111111111111","job_id":"d0000000-0000-0000-0000-000000000003",
   "search_profile_id":"e0000000-0000-0000-0000-000000000001","score":90,"breakdown":{"excludedBy":null},"state":"new"},
  {"user_id":"11111111-1111-1111-1111-111111111111","job_id":"d0000000-0000-0000-0000-000000000004",
   "search_profile_id":"e0000000-0000-0000-0000-000000000001","score":90,"breakdown":{"excludedBy":null},"state":"new"}
]'::jsonb) $$, 'upsert_job_matches runs');
select is((select score::int from public.job_matches where job_id = 'd0000000-0000-0000-0000-000000000001'), 60,
  'inserts a new match');
select is((select state || ':' || score from public.job_matches where job_id = 'd0000000-0000-0000-0000-000000000002'),
  'seen:50', 'seen match is untouched');
select is((select state || ':' || score from public.job_matches where job_id = 'd0000000-0000-0000-0000-000000000003'),
  'hidden:50', 'user-hidden match is never resurrected');
select is((select state || ':' || score from public.job_matches where job_id = 'd0000000-0000-0000-0000-000000000004'),
  'new:90', 'exclude-hidden match comes back when no longer excluded');

select public.upsert_job_matches('[
  {"user_id":"11111111-1111-1111-1111-111111111111","job_id":"d0000000-0000-0000-0000-000000000001",
   "search_profile_id":"e0000000-0000-0000-0000-000000000001","score":70,"breakdown":{"excludedBy":"senior"},"state":"hidden"}
]'::jsonb);
select is((select state || ':' || score from public.job_matches where job_id = 'd0000000-0000-0000-0000-000000000001'),
  'hidden:70', 'new match is rescored and hidden by an exclude rule');

-- deleting the profile drops its new and seen matches and keeps the user's hidden ones
update public.job_matches set state = 'new', breakdown = '{"excludedBy":null}'
  where job_id = 'd0000000-0000-0000-0000-000000000001';
delete from public.search_profiles where id = 'e0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.job_matches
  where user_id = '11111111-1111-1111-1111-111111111111' and state = 'new'), 0, 'profile delete removes new matches');
select is((select array_agg(job_id order by job_id)::text from public.job_matches
  where user_id = '11111111-1111-1111-1111-111111111111'),
  '{d0000000-0000-0000-0000-000000000003}',
  'profile delete drops seen matches and keeps user-hidden ones');

-- ---------- F6: search profile limits ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok($$ select public.upsert_job_matches('[]'::jsonb) $$, '42501', null, 'users cannot upsert matches');
select throws_ok($$ delete from public.job_matches $$, '42501', null, 'users cannot delete matches');
select lives_ok($$ insert into public.search_profiles (user_id, name, keywords)
  select '11111111-1111-1111-1111-111111111111', 'P' || g, '{react}' from generate_series(1, 5) g $$,
  'can create five profiles');
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'Sixth', '{react}') $$,
  'P0001', 'search profile limit reached', 'sixth profile is rejected');
delete from public.search_profiles where name = 'P5';
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'Sixteen kw', '{a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p}') $$,
  '23514', null, 'sixteen keywords are rejected');
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'No kw', '{}') $$,
  '23514', null, 'zero keywords are rejected');
select throws_ok(format($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'Long', '{%s}') $$, repeat('k', 61)),
  '23514', null, 'a 61-char keyword is rejected');
select throws_ok(format($$ insert into public.search_profiles (user_id, name, keywords, skills)
  values ('11111111-1111-1111-1111-111111111111', 'Long skill', '{react}', '{%s}') $$, repeat('s', 61)),
  '23514', null, 'a 61-char skill is rejected');
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords, skills)
  select '11111111-1111-1111-1111-111111111111', 'Many skills', '{react}', array_agg('s' || g) from generate_series(1, 101) g $$,
  '23514', null, '101 skills are rejected');
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords, locations)
  select '11111111-1111-1111-1111-111111111111', 'Many places', '{react}', array_agg('l' || g) from generate_series(1, 11) g $$,
  '23514', null, '11 locations are rejected');
select lives_ok(format($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'Max', '{%s}') $$, repeat('k', 60)),
  'a 60-char keyword is accepted');

select * from finish();
rollback;
