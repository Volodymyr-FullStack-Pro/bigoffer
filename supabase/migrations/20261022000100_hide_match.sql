-- "Hide" is the user's final word: besides state = 'hidden' it drops the rule mark (breakdown.excludedBy), because
-- the match refresh re-evaluates rule-hidden rows and would otherwise bring the job back once the rule stops applying.
create or replace function public.hide_match(p_match_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.job_matches m
     set state = 'hidden',
         breakdown = m.breakdown - 'excludedBy'
   where m.id = p_match_id
     and m.user_id = auth.uid()
  returning m.job_id;
$$;
revoke all on function public.hide_match(uuid) from public, anon;
grant execute on function public.hide_match(uuid) to authenticated;
