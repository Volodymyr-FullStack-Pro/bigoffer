-- Plan 6d: Adzuna (official API, needs ADZUNA_APP_ID + ADZUNA_APP_KEY). Polled rarely: the free key has a small daily quota.
insert into public.sources (id, name, kind, min_interval_minutes) values ('adzuna', 'Adzuna', 'api', 360)
on conflict (id) do nothing;
