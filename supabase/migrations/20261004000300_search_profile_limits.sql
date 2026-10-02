-- F6: bound what a user can make the scraper do through direct PostgREST writes (the form enforces the same).

-- Immutable helper for CHECK constraints (subqueries are not allowed there).
create or replace function public.text_array_max_len(arr text[])
returns int language sql immutable parallel safe set search_path = '' as $$
  select coalesce(max(char_length(e)), 0) from unnest(arr) as e
$$;
-- CHECK constraints run with the inserting user's privileges, so authenticated needs EXECUTE.
revoke execute on function public.text_array_max_len(text[]) from public, anon, authenticated;
grant execute on function public.text_array_max_len(text[]) to authenticated, service_role;

alter table public.search_profiles
  add constraint search_profiles_keywords_count check (cardinality(keywords) between 1 and 5),
  add constraint search_profiles_skills_count check (cardinality(skills) <= 30),
  add constraint search_profiles_exclude_count check (cardinality(exclude_keywords) <= 30),
  add constraint search_profiles_locations_count check (cardinality(locations) <= 10),
  add constraint search_profiles_term_length check (
    public.text_array_max_len(keywords) <= 60
    and public.text_array_max_len(skills) <= 60
    and public.text_array_max_len(exclude_keywords) <= 60
    and public.text_array_max_len(locations) <= 60
  );

-- At most 5 profiles per user. SECURITY DEFINER so the count is not limited by RLS; the advisory lock
-- serializes concurrent inserts of one user.
create or replace function public.enforce_search_profile_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('search_profiles:' || new.user_id::text, 0));
  if (select count(*) from public.search_profiles where user_id = new.user_id) >= 5 then
    raise exception 'search profile limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_search_profile_limit() from public, anon, authenticated;

create trigger search_profiles_limit before insert on public.search_profiles
  for each row execute function public.enforce_search_profile_limit();
