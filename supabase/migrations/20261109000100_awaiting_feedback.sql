-- After an interview: until when the company promised feedback. The card waits calmly until then and asks for a
-- reminder after; a reply from the company or a reminder sent ends the wait.
alter table public.applications add column feedback_due_at timestamptz;
grant update (feedback_due_at) on public.applications to authenticated;

create or replace function public.ping_application(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_count smallint;
begin
  update public.applications set follow_up_count = follow_up_count + 1, last_activity_at = now(), feedback_due_at = null
  where id = p_id and user_id = v_uid
  returning follow_up_count into v_count;
  if v_count is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  insert into public.application_events (application_id, user_id, type, payload)
  values (p_id, v_uid, 'follow_up_sent', jsonb_build_object('count', v_count));
end $$;
