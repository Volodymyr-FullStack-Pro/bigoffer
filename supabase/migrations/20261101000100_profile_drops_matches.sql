-- One search per user, built from their CV. A deleted search takes its unreviewed matches with it
-- (saved and hidden ones stay: they are the user's own decisions).
create function public.drop_profile_matches() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.job_matches where search_profile_id = old.id and state in ('new', 'seen');
  return old;
end;
$$;
revoke all on function public.drop_profile_matches() from public, anon, authenticated;

create trigger search_profiles_drop_matches before delete on public.search_profiles
  for each row execute function public.drop_profile_matches();
