-- Allow negative settlement amounts for partner losses (алдагдал).
-- Unit rates stay non-negative; final amount_mnt may be negative.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'gym_billing_settlements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%amount_mnt%'
  loop
    execute format('alter table public.gym_billing_settlements drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.gym_billing_settlements
  add constraint gym_billing_settlements_amount_mnt_range
    check (amount_mnt between -999999999 and 999999999),
  add constraint gym_billing_settlements_computed_amount_mnt_nonneg
    check (computed_amount_mnt >= 0),
  add constraint gym_billing_settlements_unit_amount_mnt_nonneg
    check (unit_amount_mnt is null or unit_amount_mnt >= 0);

comment on column public.gym_billing_settlements.amount_mnt is
  'Final settlement amount in MNT. May be negative for partner losses (алдагдал).';
