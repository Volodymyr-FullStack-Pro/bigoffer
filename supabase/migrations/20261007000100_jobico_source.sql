-- Jobico (jobico.io): Ukrainian IT board with an official XML feed for aggregators.
insert into public.sources (id, name, kind, min_interval_minutes) values ('jobico', 'Jobico', 'rss', 120)
on conflict (id) do nothing;
