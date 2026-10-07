begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select results_eq(
  $$ select id from public.sources where id = any(array['dou','djinni','robotaua','jooble','remoteok','remotive','himalayas','wwr','hn','workua','olx','linkedin','arbeitnow','jobicy','workingnomads','justjoin','jobico','greenhouse','lever','ashby','workable','telegram']) order by id $$,
  $$ select unnest(array['arbeitnow','ashby','djinni','dou','greenhouse','himalayas','hn','jobico','jobicy','jooble','justjoin','lever','linkedin','olx','remoteok','remotive','robotaua','telegram','workable','workingnomads','workua','wwr']) $$,
  'every SOURCE_IDS source exists'
);
select cmp_ok((select count(*) from public.roles), '>=', 10::bigint, 'roles are seeded by migrations');
select cmp_ok((select count(*) from public.skills), '>=', 10::bigint, 'skills are seeded by migrations');

select * from finish();
rollback;
