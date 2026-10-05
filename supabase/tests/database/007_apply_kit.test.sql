begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/cv.pdf', 'cv.pdf') $$, 'own CV row');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000b/cv.pdf', 'x.pdf') $$,
  '23514', null, 'CV path must be in the owner folder');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/cv2.pdf', 'cv2.pdf') $$,
  '23505', null, 'only one primary CV');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000a/cv.pdf') $$,
  'upload into own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000b/cv.pdf') $$,
  '42501', null, 'cannot upload into another folder');
select lives_ok($$ insert into public.answer_bank (user_id, key, question, answer)
  values ('a6000000-0000-0000-0000-00000000000a', 'salary', 'Salary?', '{"en":"$4000"}') $$, 'answer bank row');
select lives_ok($$ insert into public.apply_kits (user_id, job_id, lang, cover_letter, short_message)
  values ('a6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000001', 'en', 'Dear…', 'Hi') $$, 'apply kit row');
select throws_ok($$ insert into public.apply_kits (user_id, job_id, lang, cover_letter, short_message)
  values ('a6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000001', 'en', 'x', repeat('a', 501)) $$,
  '23514', null, 'short message is at most 500 characters');

set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.resumes) + (select count(*)::int from public.answer_bank) + (select count(*)::int from public.apply_kits),
  0, 'another user sees none of it');
select is((select count(*)::int from storage.objects where bucket_id = 'resumes'), 0, 'another user cannot list the CV file');

select * from finish();
rollback;
