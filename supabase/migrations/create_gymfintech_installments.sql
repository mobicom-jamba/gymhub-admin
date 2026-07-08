-- GymFinTech: хүүгүй, дотоод хуваан төлөлтийн систем.
-- Алдаа: "Could not find the table 'public.installment_plans'" гэж гарвал энэ миграцийг ажиллуулна.

create table if not exists public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id text not null unique,
  plan_tier text not null,
  total_amount numeric(14, 2) not null,
  installment_count smallint not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint installment_plans_count_chk check (installment_count between 2 and 8),
  constraint installment_plans_status_chk check (status in ('active', 'completed', 'cancelled'))
);

create index if not exists idx_installment_plans_user
  on public.installment_plans (user_id);

create table if not exists public.installment_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.installment_plans (id) on delete cascade,
  installment_no smallint not null,
  amount numeric(14, 2) not null,
  due_date date not null,
  status text not null default 'pending',
  qpay_invoice_id text,
  qpay_qr_image text,
  qpay_qr_text text,
  qpay_bank_urls jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint installment_payments_unique unique (plan_id, installment_no),
  constraint installment_payments_status_chk
    check (status in ('pending', 'invoice_created', 'paid', 'overdue'))
);

create index if not exists idx_installment_payments_due
  on public.installment_payments (status, due_date);

comment on table public.installment_plans is 'GymFinTech хуваан төлөлтийн багц (хүүгүй, дотоод).';
comment on table public.installment_payments is 'Багц тус бүрийн хуваарьт төлбөрүүд.';
