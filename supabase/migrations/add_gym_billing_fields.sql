-- Per-entry or fixed monthly partner billing for fitness gyms.
-- per_entry: amount_mnt = visit_count * billing_amount_mnt
-- monthly_fixed: amount_mnt = billing_amount_mnt (every month)

alter table public.gyms
  add column if not exists billing_mode text
    check (billing_mode is null or billing_mode in ('per_entry', 'monthly_fixed')),
  add column if not exists billing_amount_mnt integer
    check (billing_amount_mnt is null or billing_amount_mnt >= 0);

comment on column public.gyms.billing_mode is
  'Partner billing: per_entry (visit × amount) or monthly_fixed (flat monthly fee). null = not billed.';
comment on column public.gyms.billing_amount_mnt is
  'MNT amount: per visit when billing_mode=per_entry, or flat monthly when monthly_fixed.';
