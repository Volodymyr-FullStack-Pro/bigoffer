-- One palette with the mint brand: the default labels move from lime/indigo/sky/orange/pink to the app's own hues.
-- New users get them from handle_new_user; existing labels change only while they still carry the old default colour.
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
    (new.id, 'priority', '#73F7B2'),
    (new.id, 'referral', '#B494FF'),
    (new.id, 'via_recruiter', '#4CC4FF'),
    (new.id, 'no_salary', '#FFBF47'),
    (new.id, 'awaiting_interview', '#FF6FAE');

  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;


update public.labels l set color = n.color
from (values ('priority', '#C6F432', '#73F7B2'), ('referral', '#7B5CFF', '#B494FF'), ('via_recruiter', '#38BDF8', '#4CC4FF'),
             ('no_salary', '#F59E0B', '#FFBF47'), ('awaiting_interview', '#F472B6', '#FF6FAE')) as n(key, old, color)
where l.key = n.key and upper(l.color) = n.old;
