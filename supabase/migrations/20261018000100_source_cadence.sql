-- Cadence by measured yield (24 h of prod runs): sources that produced almost no matches are polled less often,
-- which pays for polling DOU / Djinni / robota.ua without the cost multiplier (see PRIORITY_SOURCE_IDS).
update public.sources set min_interval_minutes = 360 where id in ('remotive', 'himalayas', 'telegram');
update public.sources set min_interval_minutes = 720 where id = 'workable';
