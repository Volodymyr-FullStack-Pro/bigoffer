begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  (select count(*)::int from public.sources
   where id in ('dou','djinni','robotaua') and enabled),
  3, 'the three boards are enabled');
select is((select min_interval_minutes from public.sources where id = 'dou'), 30, 'DOU is polled every 30 minutes');

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'src@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok($$ insert into public.search_profiles (user_id, name, keywords, sources)
  values ('55555555-5555-5555-5555-555555555555', 'A', '{react}', '{dou,djinni}') $$, 'sources can be chosen');
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords, sources)
  values ('55555555-5555-5555-5555-555555555555', 'B', '{react}', '{}') $$, '23514', null, 'empty source list rejected');
select lives_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('55555555-5555-5555-5555-555555555555', 'C', '{react}') $$, 'null sources means defaults');

select * from finish();
rollback;
