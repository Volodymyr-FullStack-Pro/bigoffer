-- "Why it fits" is written against the search as it was; once the search changes, it can claim the wrong format,
-- salary or skills. A change to the criteria the explanation reads clears it, so the next explain run writes it again.
create or replace function public.reset_match_explanations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.keywords is distinct from old.keywords
    or new.skills is distinct from old.skills
    or new.seniority is distinct from old.seniority
    or new.remote_type is distinct from old.remote_type
    or new.salary_min_usd is distinct from old.salary_min_usd then
    update public.job_matches
      set explanation = null, explained_at = null
      where search_profile_id = new.id and explained_at is not null;
  end if;
  return new;
end;
$$;

revoke execute on function public.reset_match_explanations() from public, anon, authenticated;

drop trigger if exists search_profiles_reset_explanations on public.search_profiles;
create trigger search_profiles_reset_explanations
  after update on public.search_profiles
  for each row execute function public.reset_match_explanations();

-- Explanations written before the search was last saved may describe the old search.
update public.job_matches m
  set explanation = null, explained_at = null
  from public.search_profiles sp
  where m.search_profile_id = sp.id and m.explained_at < sp.updated_at;
