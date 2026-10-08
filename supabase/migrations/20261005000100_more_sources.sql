-- Plan 3: more job boards and per-profile source selection.
insert into public.sources (id, name, kind, min_interval_minutes) values
  ('workua', 'Work.ua', 'html', 180),
  ('olx', 'OLX Робота', 'html', 180),
  ('linkedin', 'LinkedIn (guest, beta)', 'html', 240),
  ('arbeitnow', 'Arbeitnow', 'api', 120),
  ('jobicy', 'Jobicy', 'api', 120),
  ('workingnomads', 'Working Nomads', 'api', 180),
  ('justjoin', 'Just Join IT', 'api', 120)
on conflict (id) do nothing;

-- linkedin existed from the Plan 1 seed as email alerts; it is now the guest HTML source.
update public.sources set name = 'LinkedIn (guest, beta)', kind = 'html', min_interval_minutes = 240 where id = 'linkedin';

alter table public.search_profiles add column sources text[];
alter table public.search_profiles
  add constraint search_profiles_sources_count check (sources is null or cardinality(sources) between 1 and 30),
  add constraint search_profiles_sources_len check (sources is null or public.text_array_max_len(sources) <= 32);
