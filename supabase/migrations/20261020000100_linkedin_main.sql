-- LinkedIn is one of the four main boards now (full descriptions from the guest posting page, closed postings
-- detected): polled as often as Djinni / robota.ua and no longer labelled beta.
update public.sources set min_interval_minutes = 120, name = 'LinkedIn' where id = 'linkedin';
