-- A search can hide jobs built on a main stack the candidate does not have (Java, .NET, PHP, Angular, …).
-- Off by default: such jobs then only score lower, as before.
alter table public.search_profiles
  add column hide_other_stacks boolean not null default false;
