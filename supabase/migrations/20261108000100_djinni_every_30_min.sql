-- Djinni posts get most applications in their first hour: scan it every 30 min like DOU (4 queries → 8 requests an hour).
update public.sources set min_interval_minutes = 30 where id = 'djinni';
