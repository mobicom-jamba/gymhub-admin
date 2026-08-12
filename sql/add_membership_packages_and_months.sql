-- GymHub: payment_app_settings — багцын хугацаа + packages JSON
-- Supabase Dashboard → SQL Editor → Run

alter table public.payment_app_settings
  add column if not exists smart1_months integer not null default 12,
  add column if not exists standard3_months integer not null default 6,
  add column if not exists premium_months integer not null default 12,
  add column if not exists premium4_months integer not null default 12,
  add column if not exists smart1_pool_months integer not null default 3,
  add column if not exists premium_yoga_months integer not null default 3,
  add column if not exists premium4_pool_months integer not null default 3,
  add column if not exists premium4_yoga_months integer not null default 3;

alter table public.payment_app_settings
  add column if not exists packages jsonb;
