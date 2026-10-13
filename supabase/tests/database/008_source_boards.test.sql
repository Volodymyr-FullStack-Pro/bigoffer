begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- The company boards and Telegram channels were retired with their sources (20261026000100_feed_three_boards).
select is((select count(*)::int from public.sources where enabled and id in ('greenhouse','lever','ashby','workable','telegram')), 0, 'board sources are disabled');
select is((select count(*)::int from public.source_boards), 0, 'no boards are left to poll');

set local role authenticated;
select throws_ok($$ select * from public.source_boards $$, '42501', null, 'boards are service-only');

select * from finish();
rollback;
