begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select results_eq(
  $$ select id from public.sources where enabled order by id $$,
  $$ select unnest(array['djinni','dou','robotaua']) $$,
  'exactly the SOURCE_IDS sources are enabled'
);
select is((select count(*)::int from public.sources where id not in ('dou','djinni','robotaua')), 0, 'only the three boards are left');
select cmp_ok((select count(*) from public.roles), '>=', 10::bigint, 'roles are seeded by migrations');
select cmp_ok((select count(*) from public.skills), '>=', 10::bigint, 'skills are seeded by migrations');

select * from finish();
rollback;
