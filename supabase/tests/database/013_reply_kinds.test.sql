begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('a1300000-0000-0000-0000-00000000000a', 'reply-a@test.dev');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.applications (id, user_id, column_id, rank, title)
  values ('f1300000-0000-0000-0000-000000000001', 'a1300000-0000-0000-0000-00000000000a',
    (select id from public.board_columns where user_id = 'a1300000-0000-0000-0000-00000000000a' limit 1), 'a0', 'T');

select lives_ok($$ insert into public.application_messages (application_id, user_id, direction, channel, body, ai_classification)
  values ('f1300000-0000-0000-0000-000000000001', 'a1300000-0000-0000-0000-00000000000a', 'in', 'email', 'We got your application', 'auto_reply') $$,
  'an inbound auto-reply is stored');
select throws_ok($$ insert into public.application_messages (application_id, user_id, direction, channel, body, ai_classification)
  values ('f1300000-0000-0000-0000-000000000001', 'a1300000-0000-0000-0000-00000000000a', 'in', 'email', 'x', 'spam') $$,
  '23514', null, 'unknown reply kind refused');
select lives_ok($$ update public.applications set reply_kind = 'interview_invite' where id = 'f1300000-0000-0000-0000-000000000001' $$,
  'the owner sets the reply kind');
select throws_ok($$ update public.applications set reply_kind = 'maybe' where id = 'f1300000-0000-0000-0000-000000000001' $$,
  '23514', null, 'unknown card reply kind refused');

select lives_ok($$ update public.application_messages set ai_classification = 'other' where application_id = 'f1300000-0000-0000-0000-000000000001' $$,
  'the owner re-tags a saved reply');
select throws_ok($$ update public.application_messages set body = 'changed' where application_id = 'f1300000-0000-0000-0000-000000000001' $$,
  '42501', null, 'the message text cannot be changed');

select * from finish();
rollback;
