-- Aggregate remaining admin scans (monthly visits, settlements, commissions,
-- paid-booking user lists) instead of downloading thousands of rows via PostgREST.

create index if not exists idx_gym_visits_gym_checked_in
  on public.gym_visits (gym_id, checked_in_at)
  where status is distinct from 'rejected';

create index if not exists idx_bookings_paid_user
  on public.bookings (user_id)
  where payment_status = 'paid';

create index if not exists idx_bookings_paid_id
  on public.bookings (id)
  where payment_status = 'paid';

create index if not exists idx_sales_commissions_created
  on public.sales_commissions (created_at);

-- Per gym, last N months in Asia/Ulaanbaatar (same as UTC+8).
create or replace function public.gym_visit_counts_by_month(p_gym_id text, p_since timestamptz)
returns table(month text, visitor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(gv.checked_in_at at time zone 'Asia/Ulaanbaatar', 'YYYY-MM') as month,
         count(*)::bigint
  from public.gym_visits gv
  where gv.gym_id = p_gym_id
    and gv.status is distinct from 'rejected'
    and gv.checked_in_at >= p_since
  group by 1
  order by 1 desc;
$$;

-- Settlements: one calendar window, counts per gym.
create or replace function public.gym_visit_counts_in_range(p_start timestamptz, p_end timestamptz)
returns table(gym_id text, visitor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select gv.gym_id, count(*)::bigint
  from public.gym_visits gv
  where gv.status is distinct from 'rejected'
    and gv.checked_in_at >= p_start
    and gv.checked_in_at < p_end
    and gv.gym_id is not null
  group by gv.gym_id;
$$;

-- Settlements ?all=1: counts per gym × Ulaanbaatar month.
create or replace function public.gym_visit_counts_by_gym_month(p_start timestamptz, p_end timestamptz)
returns table(gym_id text, month text, visitor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select gv.gym_id,
         to_char(gv.checked_in_at at time zone 'Asia/Ulaanbaatar', 'YYYY-MM') as month,
         count(*)::bigint
  from public.gym_visits gv
  where gv.status is distinct from 'rejected'
    and gv.checked_in_at >= p_start
    and gv.checked_in_at < p_end
    and gv.gym_id is not null
  group by 1, 2;
$$;

-- Dashboard visits-by-month (ISO/UTC month, matching previous JS slice).
create or replace function public.gym_visit_counts_by_utc_month(p_since timestamptz)
returns table(month text, visitor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(gv.checked_in_at at time zone 'UTC', 'YYYY-MM') as month,
         count(*)::bigint
  from public.gym_visits gv
  where gv.status is distinct from 'rejected'
    and gv.checked_in_at >= p_since
  group by 1
  order by 1;
$$;

create or replace function public.sales_commission_totals_by_month(p_since timestamptz)
returns table(month text, total_amount numeric)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(sc.created_at at time zone 'UTC', 'YYYY-MM') as month,
         coalesce(sum(sc.commission_amount), 0)::numeric
  from public.sales_commissions sc
  where sc.created_at >= p_since
  group by 1
  order by 1;
$$;

create or replace function public.paid_booking_user_ids_by_id_prefix(p_prefix text)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct b.user_id
  from public.bookings b
  where b.payment_status = 'paid'
    and b.id like p_prefix || '%'
    and b.user_id is not null;
$$;

-- Distinct paid users × channel (not every booking row).
create or replace function public.paid_booking_user_channels()
returns table(user_id uuid, payment_channel text, qpay_invoice_id text)
language sql
stable
security definer
set search_path = public
as $$
  select b.user_id,
         coalesce(nullif(trim(b.payment_channel), ''), '') as payment_channel,
         max(b.qpay_invoice_id) as qpay_invoice_id
  from public.bookings b
  where b.payment_status = 'paid'
    and b.user_id is not null
  group by b.user_id, coalesce(nullif(trim(b.payment_channel), ''), '');
$$;

revoke all on function public.gym_visit_counts_by_month(text, timestamptz) from public;
revoke all on function public.gym_visit_counts_in_range(timestamptz, timestamptz) from public;
revoke all on function public.gym_visit_counts_by_gym_month(timestamptz, timestamptz) from public;
revoke all on function public.gym_visit_counts_by_utc_month(timestamptz) from public;
revoke all on function public.sales_commission_totals_by_month(timestamptz) from public;
revoke all on function public.paid_booking_user_ids_by_id_prefix(text) from public;
revoke all on function public.paid_booking_user_channels() from public;

grant execute on function public.gym_visit_counts_by_month(text, timestamptz) to service_role, authenticated;
grant execute on function public.gym_visit_counts_in_range(timestamptz, timestamptz) to service_role;
grant execute on function public.gym_visit_counts_by_gym_month(timestamptz, timestamptz) to service_role;
grant execute on function public.gym_visit_counts_by_utc_month(timestamptz) to service_role;
grant execute on function public.sales_commission_totals_by_month(timestamptz) to service_role;
grant execute on function public.paid_booking_user_ids_by_id_prefix(text) to service_role;
grant execute on function public.paid_booking_user_channels() to service_role, authenticated;

comment on function public.gym_visit_counts_by_month(text, timestamptz) is
  'Per-gym monthly visit counts in Asia/Ulaanbaatar. Replaces gym-visit-monthly / gym-monthly-stats row paging.';
comment on function public.gym_visit_counts_in_range(timestamptz, timestamptz) is
  'Visit counts per gym in [start, end). Replaces settlements countVisitsByGym paging.';
comment on function public.paid_booking_user_channels() is
  'Distinct paid booking users with channel. Replaces unbounded bookings scans on Users page.';
