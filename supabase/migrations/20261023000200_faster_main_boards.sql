-- Being among the first applicants needs fresh postings within the hour: DOU (RSS, cheap) every 30 min,
-- Djinni and robota.ua hourly. LinkedIn stays at 2 h (it rate-limits and every run reads each posting page).
update public.sources set min_interval_minutes = 30 where id = 'dou';
update public.sources set min_interval_minutes = 60 where id in ('djinni', 'robotaua');
