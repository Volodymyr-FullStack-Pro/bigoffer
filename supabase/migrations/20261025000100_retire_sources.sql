-- Only DOU, Djinni and robota.ua stay: nearly every good match and application came from them. The other boards'
-- adapters are gone, so the scheduler must not pick their queries. Rows stay (jobs, postings and applications still
-- reference them); nothing is deleted.
update public.sources set enabled = false where id not in ('dou', 'djinni', 'robotaua');
