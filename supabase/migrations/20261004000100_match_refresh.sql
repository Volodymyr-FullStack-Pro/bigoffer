-- F1: match rows follow profile edits instead of freezing at first insert.

-- Service-only bulk upsert. A rescored row overwrites the stored one only while the user has not acted on it:
-- state 'new', or 'hidden' by an exclude rule (breakdown.excludedBy set). Seen / saved / user-hidden rows stay.
-- A different profile of the same user takes the row over only with a higher score.
create or replace function public.upsert_job_matches(rows jsonb)
returns void language sql security invoker set search_path = '' as $$
  insert into public.job_matches as m (user_id, job_id, search_profile_id, score, breakdown, state)
  select r.user_id, r.job_id, r.search_profile_id, r.score, r.breakdown, r.state
  from jsonb_to_recordset(rows) as r(
    user_id uuid, job_id uuid, search_profile_id uuid, score smallint, breakdown jsonb, state text
  )
  on conflict (user_id, job_id) do update
    set score = excluded.score,
        breakdown = excluded.breakdown,
        search_profile_id = excluded.search_profile_id,
        state = excluded.state
    where (m.state = 'new' or (m.state = 'hidden' and m.breakdown ->> 'excludedBy' is not null))
      and (m.search_profile_id is null
           or m.search_profile_id = excluded.search_profile_id
           or excluded.score > m.score)
      and (m.score, m.breakdown, m.search_profile_id, m.state)
          is distinct from (excluded.score, excluded.breakdown, excluded.search_profile_id, excluded.state)
$$;
revoke execute on function public.upsert_job_matches(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_job_matches(jsonb) to service_role;

-- Deleting a profile drops its untouched matches. The FK is ON DELETE SET NULL, which would orphan them,
-- so this runs BEFORE DELETE. SECURITY DEFINER: users may delete their profile but not job_matches rows.
create or replace function public.delete_profile_new_matches()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.job_matches where search_profile_id = old.id and state = 'new';
  return old;
end $$;
revoke execute on function public.delete_profile_new_matches() from public, anon, authenticated;

create trigger search_profiles_delete_new_matches before delete on public.search_profiles
  for each row execute function public.delete_profile_new_matches();
