-- A column for applications the company actually answered ("In talks"), between Applied and Test task, so Applied
-- holds only the ones still waiting for any reply.
update public.board_columns c
set position = c.position + 1
from public.board_columns a
where a.user_id = c.user_id and a.key = 'applied' and c.position > a.position
  and not exists (select 1 from public.board_columns t where t.user_id = c.user_id and t.key = 'talking');

insert into public.board_columns (user_id, key, title, position, kind)
select a.user_id, 'talking', '{"uk":"В діалозі","ru":"В диалоге","en":"In talks"}', a.position + 1, 'active'
from public.board_columns a
where a.key = 'applied'
on conflict (user_id, key) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );

  insert into public.board_columns (user_id, key, title, position, kind) values
    (new.id, 'saved',     '{"uk":"Збережено","ru":"Сохранено","en":"Saved"}', 0, 'active'),
    (new.id, 'applied',   '{"uk":"Відгукнувся","ru":"Откликнулся","en":"Applied"}', 1, 'active'),
    (new.id, 'talking',   '{"uk":"В діалозі","ru":"В диалоге","en":"In talks"}', 2, 'active'),
    (new.id, 'test_task', '{"uk":"Тестове","ru":"Тестовое","en":"Test task"}', 3, 'active'),
    (new.id, 'interview', '{"uk":"Інтерв''ю","ru":"Интервью","en":"Interview"}', 4, 'active'),
    (new.id, 'offer',     '{"uk":"Офер","ru":"Оффер","en":"Offer"}', 5, 'won'),
    (new.id, 'rejected',  '{"uk":"Відмова","ru":"Отказ","en":"Rejected"}', 6, 'lost');

  insert into public.labels (user_id, key, color) values
    (new.id, 'priority', '#C6F432'),
    (new.id, 'referral', '#7B5CFF'),
    (new.id, 'via_recruiter', '#38BDF8'),
    (new.id, 'no_salary', '#F59E0B'),
    (new.id, 'awaiting_interview', '#F472B6');

  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

