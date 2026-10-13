begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev', '{}');

-- trigger side effects (as superuser)
select is((select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice', 'profile created with name from metadata');
select is((select locale from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'en', 'new profile defaults to English');
select is((select count(*)::int from public.board_columns where user_id = '11111111-1111-1111-1111-111111111111'),
  7, 'seven default board columns');
select is((select kind from public.board_columns where user_id = '11111111-1111-1111-1111-111111111111' and key = 'offer'),
  'won', 'offer column is won');
select is((select count(*)::int from public.labels where user_id = '11111111-1111-1111-1111-111111111111'),
  5, 'five default labels');
select isnt((select inbound_email_token from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  (select inbound_email_token from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'inbound tokens are unique');
select matches((select inbound_email_token from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '^[0-9a-f]{32}$', 'inbound token is 128-bit hex');

-- act as Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.profiles), 1, 'sees only own profile');
select is((select count(*)::int from public.board_columns), 7, 'sees only own columns');
select is((select count(*)::int from public.labels), 5, 'sees only own labels');
select ok((select count(*) from public.sources) > 0, 'reads global sources');
select is_empty(
  $$ update public.profiles set full_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222' returning id $$,
  'cannot update another profile');
update public.profiles set full_name = 'Alice B' where id = '11111111-1111-1111-1111-111111111111';
select is((select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice B', 'can update own name');
select throws_ok(
  $$ update public.profiles set plan = 'pro' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'cannot change plan');
select throws_ok(
  $$ insert into public.board_columns (user_id, key, title, position, kind)
     values ('22222222-2222-2222-2222-222222222222', 'x', '{}', 9, 'active') $$,
  '42501', null, 'cannot insert columns for another user');
select throws_ok(
  $$ insert into public.sources (id, name, kind) values ('evil', 'Evil', 'api') $$,
  '42501', null, 'cannot write global tables');
select throws_ok(
  $$ truncate public.sources $$,
  '42501', null, 'cannot truncate global tables');
select throws_ok(
  $$ update public.board_columns set user_id = '22222222-2222-2222-2222-222222222222'
     where user_id = '11111111-1111-1111-1111-111111111111' and key = 'saved' $$,
  '42501', null, 'cannot reassign own column to another user');
select throws_ok(
  $$ insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'cannot insert profiles');
select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'cannot delete own profile');
select throws_ok(
  $$ truncate public.board_columns $$,
  '42501', null, 'cannot truncate own tables');

-- act as anonymous visitor
reset role;
set local role anon;

select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.board_columns $$, '42501', null, 'anon cannot read columns');
select throws_ok($$ select * from public.sources $$, '42501', null, 'anon cannot read global tables');
select throws_ok(
  $$ select public.handle_new_user() $$,
  '42501', null, 'anon cannot execute handle_new_user');

select * from finish();
rollback;
