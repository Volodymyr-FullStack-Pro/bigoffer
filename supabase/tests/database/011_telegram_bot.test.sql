begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b1001', 'tg1@test.local'),
  ('00000000-0000-0000-0000-0000000b1002', 'tg2@test.local');
insert into public.companies (id, name, normalized_name) values ('cb000000-0000-0000-0000-000000000001', 'Bot Co', 'bot co plan6b test');
insert into public.jobs (id, fingerprint, title, company_id) values ('db000000-0000-0000-0000-000000000001', 'p6b-1', 'Bot Job', 'cb000000-0000-0000-0000-000000000001');
insert into public.job_matches (id, user_id, job_id, score) values
  ('eb000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000b1001', 'db000000-0000-0000-0000-000000000001', 90);

-- authenticated user 1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1001","role":"authenticated"}', true);

select lives_ok($$ select public.create_telegram_link_token('hash-a') $$, 'user creates a token');
select lives_ok($$ select public.create_telegram_link_token('hash-b') $$, 'user re-creates a token');
select throws_ok($$ select * from public.telegram_link_tokens $$, '42501', null, 'users cannot read tokens');
select throws_ok($$ update public.profiles set telegram_chat_id = 5 $$, '42501', null, 'users cannot set telegram_chat_id');
select throws_ok($$ update public.profiles set digest_last_sent_on = current_date $$, '42501', null, 'users cannot set digest_last_sent_on');
select throws_ok($$ update public.job_matches set notified_at = now() $$, '42501', null, 'users cannot set notified_at');
select lives_ok($$ update public.profiles set telegram_min_score = 60, telegram_alerts = false $$, 'users can update alert settings');
select throws_ok($$ update public.profiles set telegram_min_score = 101 $$, '23514', null, 'min score is bounded');
select throws_ok($$ select public.link_telegram('hash-b', 1) $$, '42501', null, 'users cannot call link_telegram');
select throws_ok($$ select public.bot_save_match('00000000-0000-0000-0000-0000000b1001', 'eb000000-0000-0000-0000-000000000001', 'applied', 'a0') $$, '42501', null, 'users cannot call bot_save_match');

reset role;
select is((select count(*)::int from public.telegram_link_tokens where user_id = '00000000-0000-0000-0000-0000000b1001'), 1, 'one token per user');
select ok((select expires_at > now() from public.telegram_link_tokens where token_hash = 'hash-b'), 'token expires in the future');

-- service_role linking
set local role service_role;
select is(public.link_telegram('hash-b', 777), '00000000-0000-0000-0000-0000000b1001'::uuid, 'valid token links and returns user');
select is(public.link_telegram('hash-b', 777), null, 'token is single-use');
reset role;
select is((select telegram_chat_id from public.profiles where id = '00000000-0000-0000-0000-0000000b1001'), 777::bigint, 'chat id stored');

insert into public.telegram_link_tokens (token_hash, user_id, expires_at)
  values ('hash-old', '00000000-0000-0000-0000-0000000b1002', now() - interval '1 minute'),
         ('hash-u2', '00000000-0000-0000-0000-0000000b1002', now() + interval '5 minutes');
set local role service_role;
select is(public.link_telegram('hash-old', 888), null, 'expired token is rejected');
select is(public.link_telegram('hash-u2', 777), '00000000-0000-0000-0000-0000000b1002'::uuid, 'same chat for another user links');
reset role;
select is((select telegram_chat_id from public.profiles where id = '00000000-0000-0000-0000-0000000b1001'), null, 'chat id removed from the first user');

-- bot_save_match
set local role service_role;
select isnt(public.bot_save_match('00000000-0000-0000-0000-0000000b1001', 'eb000000-0000-0000-0000-000000000001', 'applied', 'a0'), null, 'owner match is saved');
select throws_ok($$ select public.bot_save_match('00000000-0000-0000-0000-0000000b1002', 'eb000000-0000-0000-0000-000000000001', 'applied', 'a0') $$, 'P0002', 'match not found', 'foreign match is rejected');
reset role;
select is((select c.key from public.applications a join public.board_columns c on c.id = a.column_id
  where a.user_id = '00000000-0000-0000-0000-0000000b1001' and a.job_id = 'db000000-0000-0000-0000-000000000001'), 'applied', 'application lands in applied');
select is((select count(*)::int from public.applications where user_id = '00000000-0000-0000-0000-0000000b1002'), 0, 'nothing created for the other user');

-- unlink + anon
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1002","role":"authenticated"}', true);
select lives_ok($$ select public.unlink_telegram() $$, 'user unlinks');
reset role;
select is((select telegram_chat_id from public.profiles where id = '00000000-0000-0000-0000-0000000b1002'), null, 'unlink clears own chat id');

set local role anon;
select throws_ok($$ select public.create_telegram_link_token('x') $$, '42501', null, 'anon cannot create tokens');
reset role;

select * from finish();
rollback;
