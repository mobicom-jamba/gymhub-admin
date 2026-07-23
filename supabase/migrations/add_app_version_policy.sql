-- Force-update policy (singleton). Readable by anon/authenticated.
-- Flip force_update=true and raise ios/android_min_version to lock older builds.

create table if not exists public.app_version_policy (
  id int primary key default 1 check (id = 1),
  ios_min_version text not null default '0.0.0',
  android_min_version text not null default '0.0.0',
  ios_store_url text not null default 'https://apps.apple.com/mn/app/gymhub-mn/id6758975675',
  android_store_url text not null default 'https://play.google.com/store/apps/details?id=com.gymhub.mongolia',
  force_update boolean not null default false,
  title text not null default 'Шинэчлэл шаардлагатай',
  message text not null default 'Аппын шинэ хувилбар гарсан байна. Үргэлжлүүлэхийн тулд шинэчилнэ үү.',
  updated_at timestamptz not null default now()
);

alter table public.app_version_policy enable row level security;

drop policy if exists "Anyone can read app version policy" on public.app_version_policy;
create policy "Anyone can read app version policy"
  on public.app_version_policy
  for select
  to anon, authenticated
  using (true);

insert into public.app_version_policy (id, ios_min_version, android_min_version, force_update)
values (1, '0.0.0', '0.0.0', false)
on conflict (id) do nothing;

revoke all on table public.app_version_policy from public;
grant select on table public.app_version_policy to anon, authenticated;
