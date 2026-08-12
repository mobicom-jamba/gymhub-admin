-- installment_* дээр RLS идэвхтэй боловч policy байхгүй байсан тул
-- authenticated/anon SELECT хоосон буцаадаг → Flexy төлбөр UI-д харагдахгүй.

alter table public.installment_plans enable row level security;
alter table public.installment_payments enable row level security;

-- Гишүүн өөрийн багц
drop policy if exists "Users can read own installment_plans" on public.installment_plans;
create policy "Users can read own installment_plans"
  on public.installment_plans
  for select
  to authenticated
  using (user_id = auth.uid());

-- Staff (admin / moderator / sales) бүх багц
drop policy if exists "Staff can read installment_plans" on public.installment_plans;
create policy "Staff can read installment_plans"
  on public.installment_plans
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'moderator', 'sales')
    )
  );

-- Гишүүн өөрийн хуваарьт төлбөр
drop policy if exists "Users can read own installment_payments" on public.installment_payments;
create policy "Users can read own installment_payments"
  on public.installment_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.installment_plans pl
      where pl.id = installment_payments.plan_id
        and pl.user_id = auth.uid()
    )
  );

-- Staff бүх хуваарьт төлбөр
drop policy if exists "Staff can read installment_payments" on public.installment_payments;
create policy "Staff can read installment_payments"
  on public.installment_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'moderator', 'sales')
    )
  );
