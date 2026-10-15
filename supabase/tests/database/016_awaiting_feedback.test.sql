begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('a1600000-0000-0000-0000-00000000000a', 'feedback-a@test.dev');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.applications (id, user_id, column_id, rank, title)
  values ('f1600000-0000-0000-0000-000000000001', 'a1600000-0000-0000-0000-00000000000a',
    (select id from public.board_columns where user_id = 'a1600000-0000-0000-0000-00000000000a' and key = 'interview'), 'a0', 'T');

select lives_ok($$ update public.applications set feedback_due_at = now() + interval '14 days'
  where id = 'f1600000-0000-0000-0000-000000000001' $$, 'the owner sets when feedback is due');
select lives_ok($$ select public.ping_application('f1600000-0000-0000-0000-000000000001') $$, 'a reminder is logged');
select is((select feedback_due_at from public.applications where id = 'f1600000-0000-0000-0000-000000000001'), null,
  'a reminder ends the wait');

select * from finish();
rollback;
