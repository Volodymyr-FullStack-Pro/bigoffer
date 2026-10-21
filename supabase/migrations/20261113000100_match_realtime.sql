-- New matches are pushed to the open Today page ("3 new jobs, show"); RLS keeps each user to their own rows.
alter publication supabase_realtime add table public.job_matches;
