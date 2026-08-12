-- Run once in Supabase SQL Editor (Dashboard → SQL).
-- Stores membership prices, durations, packages, and per-channel toggles.

create table if not exists public.payment_app_settings (
  id text primary key default 'default',
  early_membership_price_mnt integer not null default 480000,
  early_first_month_price_mnt integer not null default 150000,
  early_remainder_price_mnt integer not null default 330000,
  premium_membership_price_mnt integer not null default 780000,
  smart1_price_mnt integer not null default 780000,
  standard3_price_mnt integer not null default 480000,
  premium4_price_mnt integer not null default 980000,
  smart1_months integer not null default 12,
  standard3_months integer not null default 6,
  premium_months integer not null default 12,
  premium4_months integer not null default 12,
  smart1_pool_months integer not null default 3,
  premium_yoga_months integer not null default 3,
  premium4_pool_months integer not null default 3,
  premium4_yoga_months integer not null default 3,
  packages jsonb,
  payment_qpay_enabled boolean not null default true,
  payment_sono_enabled boolean not null default true,
  payment_pocket_enabled boolean not null default true,
  payment_carepay_enabled boolean not null default true,
  payment_monpay_enabled boolean not null default true,
  payment_gymfintech_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.payment_app_settings enable row level security;

insert into public.payment_app_settings (id)
values ('default')
on conflict (id) do nothing;
