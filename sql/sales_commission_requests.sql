-- Commission rate approval workflow
-- Run in Supabase SQL editor.

alter table public.organizations
  add column if not exists created_by uuid references public.profiles (id);

create index if not exists idx_organizations_created_by
  on public.organizations (created_by, created_at desc);

create table if not exists public.sales_commission_requests (
  id uuid primary key default gen_random_uuid(),
  sales_user_id uuid not null references public.profiles (id) on delete cascade,
  requested_rate numeric(8,5) not null check (requested_rate >= 0 and requested_rate <= 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text null,
  approved_rate numeric(8,5) null check (approved_rate >= 0 and approved_rate <= 1),
  review_note text null,
  reviewed_by uuid null references public.profiles (id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_commission_requests_sales
  on public.sales_commission_requests (sales_user_id, created_at desc);

create index if not exists idx_sales_commission_requests_status
  on public.sales_commission_requests (status, created_at desc);
