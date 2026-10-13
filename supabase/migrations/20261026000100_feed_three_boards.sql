-- Only DOU, Djinni and robota.ua remain. Profiles saved earlier still listed the retired boards, and their open
-- matches filled the feed's top 200, pushing robota.ua out. Saved and applied matches are left alone.
update public.search_profiles
   set sources = nullif(array(select s from unnest(sources) s where s in ('dou', 'djinni', 'robotaua')), '{}')
 where sources is not null and not sources <@ array['dou', 'djinni', 'robotaua'];

update public.job_matches m
   set state = 'hidden'
 where m.state in ('new', 'seen')
   and not exists (
     select 1 from public.job_postings p
      where p.job_id = m.job_id and p.source_id in ('dou', 'djinni', 'robotaua')
   );

-- The retired boards' scheduling rows and run logs (jobs and postings stay).
delete from public.search_queries where source_id not in ('dou', 'djinni', 'robotaua');
delete from public.source_runs where source_id not in ('dou', 'djinni', 'robotaua');
delete from public.source_boards;
