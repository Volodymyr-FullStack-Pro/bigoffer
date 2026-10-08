begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select count(*)::int from public.sources where id in ('greenhouse','lever','ashby','workable','telegram')), 5, 'five new sources');
select is((select min_interval_minutes from public.sources where id = 'greenhouse'), 360, 'ATS polled rarely');
select is((select min_interval_minutes from public.sources where id = 'telegram'), 180, 'telegram every 3 hours');
select ok((select count(*) from public.source_boards where origin = 'seed') >= 40, 'seed boards present');
select ok(exists (select 1 from public.source_boards where source_id = 'telegram' and slug = 'job_it_junior'), 'Ukrainian junior channel seeded');

set local role authenticated;
select throws_ok($$ select * from public.source_boards $$, '42501', null, 'boards are service-only');

select * from finish();
rollback;
