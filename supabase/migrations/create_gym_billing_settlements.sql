-- Monthly partner settlements (Тооцоо). Editable amount/notes per gym per month.

create table if not exists public.gym_billing_settlements (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  visit_count integer not null default 0 check (visit_count >= 0),
  billing_mode text check (billing_mode is null or billing_mode in ('per_entry', 'monthly_fixed')),
  unit_amount_mnt integer check (unit_amount_mnt is null or unit_amount_mnt >= 0),
  computed_amount_mnt integer not null default 0 check (computed_amount_mnt >= 0),
  amount_mnt integer not null default 0 check (amount_mnt >= 0),
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, month)
);

create index if not exists gym_billing_settlements_month_idx
  on public.gym_billing_settlements (month desc);

alter table public.gym_billing_settlements enable row level security;

revoke all on table public.gym_billing_settlements from public;
revoke all on table public.gym_billing_settlements from anon, authenticated;

comment on table public.gym_billing_settlements is
  'Monthly partner billing settlements; amount_mnt is editable override of computed_amount_mnt.';
