-- Борлуулалт: sales_promo_codes, sales_commissions, profiles.sales_referred_by
-- Алдаа: "Could not find the table 'public.sales_promo_codes'" гэж гарвал энэ миграцийг ажиллуулна.

alter table public.profiles
  add column if not exists sales_referred_by uuid references public.profiles (id);

create index if not exists idx_profiles_sales_referred_by
  on public.profiles (sales_referred_by)
  where sales_referred_by is not null;

create table if not exists public.sales_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  sales_user_id uuid not null references public.profiles (id) on delete cascade,
  commission_rate numeric(8, 5) not null default 0.05,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sales_promo_codes_rate_chk check (commission_rate >= 0 and commission_rate <= 1)
);

create unique index if not exists sales_promo_codes_code_lower_idx
  on public.sales_promo_codes (lower(trim(code)));

create unique index if not exists sales_promo_codes_one_active_per_sales_idx
  on public.sales_promo_codes (sales_user_id)
  where is_active = true;

create table if not exists public.sales_commissions (
  id uuid primary key default gen_random_uuid(),
  sales_user_id uuid not null references public.profiles (id) on delete cascade,
  buyer_user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id text not null,
  gross_amount numeric(14, 2) not null,
  commission_rate numeric(8, 5) not null,
  commission_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  constraint sales_commissions_booking_unique unique (booking_id)
);

create index if not exists idx_sales_commissions_sales_user
  on public.sales_commissions (sales_user_id, created_at desc);

comment on table public.sales_promo_codes is 'Борлуулагчийн промо код; бүртгэлд sales_referred_by тохируулна.';
comment on table public.sales_commissions is 'Гишүүнчлэлийн төлбөр төлөгдсөний дараах комисс.';
