begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select results_eq(
  $$ select id from public.sources where enabled and id = any(array['dou','djinni','robotaua','workua','linkedin','jooble','remoteok','remotive','himalayas','hn','workingnomads','greenhouse','lever','ashby','workable','telegram','itlead']) order by id $$,
  $$ select unnest(array['ashby','djinni','dou','greenhouse','himalayas','hn','itlead','jooble','lever','linkedin','remoteok','remotive','robotaua','telegram','workable','workingnomads','workua']) $$,
  'every SOURCE_IDS source exists'
);
select is((select count(*)::int from public.sources where enabled and id in ('olx','jobico','arbeitnow','justjoin','jobicy','wwr','adzuna')), 0, 'retired sources are disabled');
select cmp_ok((select count(*) from public.roles), '>=', 10::bigint, 'roles are seeded by migrations');
select cmp_ok((select count(*) from public.skills), '>=', 10::bigint, 'skills are seeded by migrations');

select * from finish();
rollback;
