-- One search per user, built from their CV: a deleted search (new CV, CV deleted) takes the matches it showed
-- with it, seen ones included. Saved and hidden ones stay: they are the user's own decisions.
create or replace function public.delete_profile_new_matches()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.job_matches where search_profile_id = old.id and state in ('new', 'seen');
  return old;
end $$;
