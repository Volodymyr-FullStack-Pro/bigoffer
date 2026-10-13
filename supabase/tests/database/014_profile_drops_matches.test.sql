begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email) values ('a1400000-0000-0000-0000-00000000000a', 'one-profile@test.dev');
insert into public.companies (id, name, normalized_name) values ('c1400000-0000-0000-0000-000000000001', 'P Co', 'p co plan14 test');
insert into public.jobs (id, fingerprint, title, company_id) values
  ('d1400000-0000-0000-0000-000000000001', 'p14-1', 'Dev 1', 'c1400000-0000-0000-0000-000000000001'),
  ('d1400000-0000-0000-0000-000000000002', 'p14-2', 'Dev 2', 'c1400000-0000-0000-0000-000000000001');
insert into public.search_profiles (id, user_id, name, keywords)
  values ('e1400000-0000-0000-0000-000000000001', 'a1400000-0000-0000-0000-00000000000a', 'CV search', '{react}');
insert into public.job_matches (user_id, job_id, search_profile_id, score, state) values
  ('a1400000-0000-0000-0000-00000000000a', 'd1400000-0000-0000-0000-000000000001', 'e1400000-0000-0000-0000-000000000001', 80, 'new'),
  ('a1400000-0000-0000-0000-00000000000a', 'd1400000-0000-0000-0000-000000000002', 'e1400000-0000-0000-0000-000000000001', 70, 'saved');

delete from public.search_profiles where id = 'e1400000-0000-0000-0000-000000000001';

select is((select count(*)::int from public.job_matches where user_id = 'a1400000-0000-0000-0000-00000000000a' and state = 'new'), 0,
  'unreviewed matches go with the search');
select is((select count(*)::int from public.job_matches where user_id = 'a1400000-0000-0000-0000-00000000000a' and state = 'saved'), 1,
  'saved matches stay');

select * from finish();
rollback;
