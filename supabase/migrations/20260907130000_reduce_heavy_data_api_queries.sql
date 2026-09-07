-- Lighten hot Data API paths that were saturating PostgREST (522 / PGRST002).
-- Aggregate in Postgres instead of downloading thousands of gym_visits / bookings rows.

create index if not exists idx_gym_visits_active_checked_in
  on public.gym_visits (checked_in_at, gym_id)
  where status in ('pending', 'approved');

create index if not exists idx_gym_visits_not_rejected_checked_in
  on public.gym_visits (checked_in_at, gym_id)
  where status is distinct from 'rejected';

create index if not exists idx_bookings_paid_membership_created
  on public.bookings (created_at)
  where payment_status = 'paid' and id like 'membership-%';

create index if not exists idx_sales_commissions_sales_user
  on public.sales_commissions (sales_user_id);

create or replace function public.gym_visit_counts_since(p_since timestamptz)
returns table(gym_id text, visitor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select gv.gym_id, count(*)::bigint
  from public.gym_visits gv
  where gv.checked_in_at >= p_since
    and gv.status is distinct from 'rejected'
    and gv.gym_id is not null
  group by gv.gym_id;
$$;

create or replace function public.gym_today_visitor_counts(p_today_start timestamptz)
returns table(gym_id text, visitor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select gv.gym_id, count(*)::bigint
  from public.gym_visits gv
  where gv.checked_in_at >= p_today_start
    and gv.status in ('pending', 'approved')
    and gv.gym_id is not null
  group by gv.gym_id;
$$;

create or replace function public.count_founding_spot_payers(p_start timestamptz)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct user_id)::bigint
  from public.bookings
  where payment_status = 'paid'
    and id like 'membership-%'
    and user_id is not null
    and coalesce(paid_at, created_at) >= p_start;
$$;

revoke all on function public.gym_visit_counts_since(timestamptz) from public;
revoke all on function public.gym_today_visitor_counts(timestamptz) from public;
revoke all on function public.count_founding_spot_payers(timestamptz) from public;

grant execute on function public.gym_visit_counts_since(timestamptz) to service_role, authenticated;
grant execute on function public.gym_today_visitor_counts(timestamptz) to service_role, authenticated, anon;
grant execute on function public.count_founding_spot_payers(timestamptz) to service_role;

comment on function public.gym_today_visitor_counts(timestamptz) is
  'Aggregated pending+approved gym_visits per gym since local-day start. Replaces row downloads on GET /api/gyms.';
comment on function public.count_founding_spot_payers(timestamptz) is
  'Distinct paid membership booking users since campaign start. Replaces 5000-row scan.';
