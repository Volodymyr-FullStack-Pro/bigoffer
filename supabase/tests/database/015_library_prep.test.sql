begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('a1500000-0000-0000-0000-00000000000a', 'lib-a@test.dev'),
  ('a1500000-0000-0000-0000-00000000000b', 'lib-b@test.dev');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.applications (id, user_id, column_id, rank, title)
  values ('f1500000-0000-0000-0000-000000000001', 'a1500000-0000-0000-0000-00000000000a',
    (select id from public.board_columns where user_id = 'a1500000-0000-0000-0000-00000000000a' limit 1), 'a0', 'T');

select lives_ok($$ insert into public.saved_links (user_id, url, title, topic)
  values ('a1500000-0000-0000-0000-00000000000a', 'https://javascript-visualizator.vercel.app/', 'Event loop', 'JavaScript') $$,
  'the owner saves a link');
select throws_ok($$ insert into public.saved_links (user_id, url, title)
  values ('a1500000-0000-0000-0000-00000000000a', 'javascript:alert(1)', 'x') $$,
  '23514', null, 'only http(s) links');
select throws_ok($$ insert into public.saved_links (user_id, url, title)
  values ('a1500000-0000-0000-0000-00000000000a', 'https://javascript-visualizator.vercel.app/', 'again') $$,
  '23505', null, 'the same link is saved once');
select lives_ok($$ insert into public.interview_preps (user_id, application_id, lang, plan)
  values ('a1500000-0000-0000-0000-00000000000a', 'f1500000-0000-0000-0000-000000000001', 'uk', '{"topics":[]}') $$,
  'the owner starts a prep for their card');
select lives_ok($$ update public.interview_preps set done = '{react}', lessons = '{"react":{}}'
  where application_id = 'f1500000-0000-0000-0000-000000000001' $$, 'the owner marks a topic learned');
select throws_ok($$ update public.interview_preps set application_id = gen_random_uuid() $$,
  '42501', null, 'a prep stays on its card');

set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.saved_links), 0, 'another user sees no links of mine');
select throws_ok($$ insert into public.interview_preps (user_id, application_id, lang, plan)
  values ('a1500000-0000-0000-0000-00000000000b', 'f1500000-0000-0000-0000-000000000001', 'uk', '{}') $$,
  '42501', null, 'no prep on someone else''s card');

select * from finish();
rollback;
