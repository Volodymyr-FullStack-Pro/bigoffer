begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000a1001', 'quota1@test.local'), ('00000000-0000-0000-0000-0000000a1002', 'quota2@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1001","role":"authenticated"}', true);

select is(public.consume_private_ai(2), true, 'first call allowed');
select is(public.consume_private_ai(2), true, 'second call allowed');
select is(public.consume_private_ai(2), false, 'third call over the limit');
select throws_ok($$ select * from public.ai_user_usage $$, '42501', null, 'table is not readable by users');
select throws_ok($$ update public.ai_user_usage set requests = 0 $$, '42501', null, 'users cannot reset the counter');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1002","role":"authenticated"}', true);
select is(public.consume_private_ai(2), true, 'limits are per user');

reset role;
select is((select requests from public.ai_user_usage where user_id = '00000000-0000-0000-0000-0000000a1001'), 2, 'over-limit call did not count');

select * from finish();
rollback;
