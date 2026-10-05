-- Plan 5 hardening: reopening/winning a card clears rejection data; index for label FK.

create index application_labels_label on public.application_labels (label_id);

create or replace function public.move_application(p_id uuid, p_column_id uuid, p_rank text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from uuid;
  v_kind text;
  v_key text;
begin
  select a.column_id into v_from from public.applications a where a.id = p_id and a.user_id = v_uid;
  if v_from is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  select c.kind, c.key into v_kind, v_key from public.board_columns c where c.id = p_column_id and c.user_id = v_uid;
  if v_kind is null then raise exception 'column not found' using errcode = 'P0002'; end if;
  if v_kind = 'lost' and v_from <> p_column_id then
    raise exception 'use reject_application to move a card to a lost column' using errcode = 'P0001';
  end if;

  update public.applications a set
    column_id = p_column_id,
    rank = p_rank,
    applied_at = case when v_key = 'applied' and a.applied_at is null then now() else a.applied_at end,
    outcome = case when v_kind = 'won' then 'offer' when v_kind = 'active' then 'open' else a.outcome end,
    rejection_stage = case when v_kind in ('active', 'won') then null else a.rejection_stage end,
    rejection_by = case when v_kind in ('active', 'won') then null else a.rejection_by end,
    rejection_reasons = case when v_kind in ('active', 'won') then '{}' else a.rejection_reasons end,
    rejection_note = case when v_kind in ('active', 'won') then null else a.rejection_note end
  where a.id = p_id;

  if v_from <> p_column_id then
    insert into public.application_events (application_id, user_id, type, payload)
    values (p_id, v_uid, 'moved', jsonb_build_object('from', v_from, 'to', p_column_id));
  end if;
end $$;

revoke execute on function public.move_application(uuid, uuid, text) from public, anon;
grant execute on function public.move_application(uuid, uuid, text) to authenticated, service_role;
