begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select has_table('public', 'resumes', 'resumes exists');
select has_table('public', 'apply_kits', 'apply_kits exists');
select has_table('public', 'application_messages', 'application_messages exists');
select is((select public from storage.buckets where id = 'resumes'), false, 'resumes bucket is private');

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-00000000000a', 'kit-a@test.dev'),
  ('a6000000-0000-0000-0000-00000000000b', 'kit-b@test.dev');
insert into public.companies (id, name, normalized_name) values ('c6000000-0000-0000-0000-000000000001', 'Kit Co', 'kit co plan6 test');
insert into public.jobs (id, fingerprint, title, company_id) values ('d6000000-0000-0000-0000-000000000001', 'p6-1', 'Dev', 'c6000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/11111111-1111-1111-1111-111111111111.pdf', 'cv.pdf') $$, 'own CV row');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000b/cv.pdf', 'x.pdf') $$,
  '23514', null, 'CV path must be in the owner folder');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/22222222-2222-2222-2222-222222222222.pdf', 'cv2.pdf') $$,
  '23505', null, 'only one primary CV');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/cv.pdf', 'cv.pdf') $$, '23514', null, 'CV path must be uuid-named');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000a/11111111-1111-1111-1111-111111111111.pdf') $$,
  'upload into own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000b/cv.pdf') $$,
  '42501', null, 'cannot upload into another folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000a/x/11111111-1111-1111-1111-111111111111.pdf') $$,
  '42501', null, 'nested path refused');
select lives_ok($$ insert into public.answer_bank (user_id, key, question, answer)
  values ('a6000000-0000-0000-0000-00000000000a', 'salary', 'Salary?', '{"en":"$4000"}') $$, 'answer bank row');
select lives_ok($$ insert into public.apply_kits (user_id, job_id, lang, cover_letter, short_message)
  values ('a6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000001', 'en', 'Dear…', 'Hi') $$, 'apply kit row');
select throws_ok($$ insert into public.apply_kits (user_id, job_id, lang, cover_letter, short_message)
  values ('a6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000001', 'en', 'x', repeat('a', 501)) $$,
  '23514', null, 'short message is at most 500 characters');

select lives_ok($$ insert into public.applications (id, user_id, column_id, rank, title)
  values ('f6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-00000000000a', (select id from public.board_columns where user_id = 'a6000000-0000-0000-0000-00000000000a' limit 1), 'a0', 'T') $$,
  'A creates an application');
set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.resumes) + (select count(*)::int from public.answer_bank) + (select count(*)::int from public.apply_kits),
  0, 'another user sees none of it');
select is((select count(*)::int from storage.objects where bucket_id = 'resumes'), 0, 'another user cannot list the CV file');
select throws_ok($$ insert into public.application_messages (application_id, user_id, direction, channel, body)
  values ('f6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-00000000000b', 'out', 'email', 'hi') $$,
  '42501', null, 'cannot message on another user application');
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'resumes';
set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'resumes'), 1, 'other user delete did not remove the CV file');

select * from finish();
rollback;
