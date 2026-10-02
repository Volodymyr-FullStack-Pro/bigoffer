-- ============ helpers ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============ global reference tables ============
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null,
  category text not null
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null,
  aliases text[] not null default '{}'
);

create table public.sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('html', 'api', 'rss', 'email')),
  enabled boolean not null default true,
  min_interval_minutes int not null default 60,
  paused_until timestamptz
);

alter table public.roles enable row level security;
alter table public.skills enable row level security;
alter table public.sources enable row level security;

create policy "roles readable" on public.roles for select to authenticated using (true);
create policy "skills readable" on public.skills for select to authenticated using (true);
create policy "sources readable" on public.sources for select to authenticated using (true);

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  locale text not null default 'uk' check (locale in ('uk', 'ru', 'en')),
  timezone text not null default 'Europe/Kyiv',
  telegram_chat_id bigint,
  inbound_email_token text not null unique
    default substr(md5(gen_random_uuid()::text), 1, 16),
  digest_hour smallint not null default 9 check (digest_hour between 0 and 23),
  plan text not null default 'free',
  contacts jsonb not null default '{}',
  follow_up_days int[] not null default '{5,10}',
  ghost_after_days int not null default 21 check (ghost_after_days between 1 and 90),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "own profile select" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (full_name, locale, timezone, digest_hour, contacts, follow_up_days,
              ghost_after_days, onboarded_at)
  on public.profiles to authenticated;

-- ============ board columns ============
create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  title jsonb not null,
  position int not null,
  kind text not null default 'active' check (kind in ('active', 'won', 'lost')),
  unique (user_id, key)
);

create index board_columns_user_idx on public.board_columns (user_id, position);
alter table public.board_columns enable row level security;

create policy "own columns" on public.board_columns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ labels ============
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text,
  name text,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  check (key is not null or name is not null),
  unique (user_id, key),
  unique (user_id, name)
);

alter table public.labels enable row level security;

create policy "own labels" on public.labels for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ new user bootstrap ============
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
    (new.id, 'test_task', '{"uk":"Тестове","ru":"Тестовое","en":"Test task"}', 2, 'active'),
    (new.id, 'interview', '{"uk":"Інтерв''ю","ru":"Интервью","en":"Interview"}', 3, 'active'),
    (new.id, 'offer',     '{"uk":"Офер","ru":"Оффер","en":"Offer"}', 4, 'won'),
    (new.id, 'rejected',  '{"uk":"Відмова","ru":"Отказ","en":"Rejected"}', 5, 'lost');

  insert into public.labels (user_id, key, color) values
    (new.id, 'priority', '#C6F432'),
    (new.id, 'referral', '#7B5CFF'),
    (new.id, 'via_recruiter', '#38BDF8'),
    (new.id, 'no_salary', '#F59E0B'),
    (new.id, 'awaiting_interview', '#F472B6');

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
