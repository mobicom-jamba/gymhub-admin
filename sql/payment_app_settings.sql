-- Run once in Supabase SQL Editor (Dashboard → SQL).
-- Stores membership prices and per-channel toggles for the mobile app + payment APIs.

create table if not exists public.payment_app_settings (
  id text primary key default 'default',
  early_membership_price_mnt integer not null default 480000,
  early_first_month_price_mnt integer not null default 150000,
  early_remainder_price_mnt integer not null default 330000,
  premium_membership_price_mnt integer not null default 780000,
  payment_qpay_enabled boolean not null default true,
  payment_sono_enabled boolean not null default true,
  payment_pocket_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.payment_app_settings enable row level security;

-- No GRANT to anon/authenticated: only service role (Next.js API) reads/writes.

insert into public.payment_app_settings (id)
values ('default')
on conflict (id) do nothing;
