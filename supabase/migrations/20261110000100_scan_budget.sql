-- Fit the background work into the Trigger.dev budget: DOU hourly (18 new jobs a day across all searches) and
-- robota.ua every 4 hours (1 new IT job a day). Djinni, the main source, stays at 30 minutes.
update public.sources set min_interval_minutes = 60 where id = 'dou';
update public.sources set min_interval_minutes = 240 where id = 'robotaua';
