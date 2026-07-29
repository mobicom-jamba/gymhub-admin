-- Sensitive write hardening:
-- 1) profiles: гишүүн role/org/referral/sap солихыг хориглоно
-- 2) bookings: гишүүн payment_* талбар хуурахыг хориглоно
-- 3) organizations: Auth * write policy устгана (зөвхөн admin / service_role)
-- 4) gym_visits: гишүүн өөртөө ирц INSERT хийхийг хаана

-- ─── profiles privileged columns ───────────────────────────────────────────
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / no JWT
  if auth.uid() is null then
    return new;
  end if;

  if public.is_full_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.organization_id := null;
    new.organization := null;
    new.sales_referred_by := null;
    new.sap_number := null;
    new.membership_started_at := null;
    new.membership_expires_at := null;
    if coalesce(new.membership_status, 'inactive') <> 'inactive' then
      new.membership_status := 'inactive';
    end if;
    return new;
  end if;

  -- UPDATE: freeze privileged columns for non-admin
  new.role := old.role;
  new.organization_id := old.organization_id;
  new.organization := old.organization;
  new.sales_referred_by := old.sales_referred_by;
  new.sap_number := old.sap_number;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileged_fields on public.profiles;
create trigger trg_guard_profile_privileged_fields
  before insert or update of
    role,
    organization_id,
    organization,
    sales_referred_by,
    sap_number
  on public.profiles
  for each row
  execute function public.guard_profile_privileged_fields();

-- ─── bookings payment forgery ──────────────────────────────────────────────
create or replace function public.guard_booking_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Гишүүн шууд төлсөн гэж бүртгэхгүй
    new.paid_at := null;
    new.membership_applied_at := null;
    new.checked_in_at := null;
    if new.payment_status is null
       or lower(coalesce(new.payment_status, '')) in ('paid', 'completed', 'success', 'refunded') then
      new.payment_status := 'unpaid';
    end if;
    return new;
  end if;

  -- UPDATE: freeze payment / check-in privilege fields
  new.payment_status := old.payment_status;
  new.paid_at := old.paid_at;
  new.amount := old.amount;
  new.payment_channel := old.payment_channel;
  new.qpay_invoice_id := old.qpay_invoice_id;
  new.membership_applied_at := old.membership_applied_at;
  new.checked_in_at := old.checked_in_at;
  return new;
end;
$$;

drop trigger if exists trg_guard_booking_payment_fields on public.bookings;
create trigger trg_guard_booking_payment_fields
  before insert or update of
    payment_status,
    paid_at,
    amount,
    payment_channel,
    qpay_invoice_id,
    membership_applied_at,
    checked_in_at
  on public.bookings
  for each row
  execute function public.guard_booking_payment_fields();

-- ─── organizations: drop overly-permissive Auth policies ───────────────────
drop policy if exists "Auth insert organizations" on public.organizations;
drop policy if exists "Auth update organizations" on public.organizations;
drop policy if exists "Auth delete organizations" on public.organizations;

drop policy if exists "Admins can insert organizations" on public.organizations;
create policy "Admins can insert organizations"
  on public.organizations for insert
  with check (public.is_admin());

drop policy if exists "Admins can update organizations" on public.organizations;
create policy "Admins can update organizations"
  on public.organizations for update
  using (public.is_admin());

drop policy if exists "Admins can delete organizations" on public.organizations;
create policy "Admins can delete organizations"
  on public.organizations for delete
  using (public.is_admin());

-- ─── gym_visits: only service_role / check-in API ───────────────────────────
drop policy if exists "Users can insert own visits" on public.gym_visits;
