begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('31111111-1111-1111-1111-111111111111', 'hide-a@test.dev'),
  ('32222222-2222-2222-2222-222222222222', 'hide-b@test.dev');
insert into public.companies (id, name, normalized_name)
  values ('c3000000-0000-0000-0000-000000000001', 'HideCo', 'hideco');
insert into public.jobs (id, fingerprint, title, company_id)
  values ('d3000000-0000-0000-0000-000000000001', 'fp-hide-1', 'Senior React Developer', 'c3000000-0000-0000-0000-000000000001');
insert into public.job_matches (id, user_id, job_id, score, state, breakdown) values
  ('f3000000-0000-0000-0000-000000000001', '31111111-1111-1111-1111-111111111111', 'd3000000-0000-0000-0000-000000000001', 80, 'hidden',
   '{"skills": 20, "excludedBy": "seniority"}'),
  ('f3000000-0000-0000-0000-000000000002', '32222222-2222-2222-2222-222222222222', 'd3000000-0000-0000-0000-000000000001', 70, 'new',
   '{"skills": 20, "excludedBy": null}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"31111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(public.hide_match('f3000000-0000-0000-0000-000000000001'), 'd3000000-0000-0000-0000-000000000001'::uuid, 'owner hides a rule-hidden match');
select is((select breakdown ? 'excludedBy' from public.job_matches where id = 'f3000000-0000-0000-0000-000000000001'), false,
  'the rule mark is dropped, so a rescore will not bring it back');
select is(public.hide_match('f3000000-0000-0000-0000-000000000002'), null::uuid, 'another user''s match is untouched');

reset role;
select is((select state from public.job_matches where id = 'f3000000-0000-0000-0000-000000000002'), 'new', 'foreign match keeps its state');

select * from finish();
rollback;
