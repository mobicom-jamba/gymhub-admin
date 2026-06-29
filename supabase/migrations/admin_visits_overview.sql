-- Single round-trip overview for the admin Visits ("Ирц") page "Бүх ирц" tab.
-- Returns header stats (total/this_month/today over non-rejected check-ins, Mongolia
-- local day) plus the most-recent p_limit visit rows enriched with the member's
-- profile (full_name, avatar_path) and per-user aggregates (total, last visit).
-- Mongolia local time (Asia/Ulaanbaatar, UTC+8). Admin/moderator only.

create index if not exists idx_gym_visits_checked_in
  on public.gym_visits (checked_in_at desc);

create or replace function public.admin_visits_overview(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats   jsonb;
  v_visits  jsonb;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role in ('admin', 'moderator')
  ) then
    raise exception 'not authorized';
  end if;

  -- Header stats over non-rejected check-ins, Mongolia local day boundaries.
  select jsonb_build_object(
    'total', count(*),
    'this_month', count(*) filter (
      where (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date
            >= date_trunc('month', (now() at time zone 'Asia/Ulaanbaatar'))::date
    ),
    'today', count(*) filter (
      where (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date
            = (now() at time zone 'Asia/Ulaanbaatar')::date
    )
  )
  into v_stats
  from public.gym_visits gv
  where gv.status <> 'rejected';

  -- Per-user aggregates over non-rejected visits.
  with agg as (
    select
      gv.user_id,
      count(*)::int            as user_total,
      max(gv.checked_in_at)    as user_last_visit_at
    from public.gym_visits gv
    where gv.status <> 'rejected'
    group by gv.user_id
  ),
  recent as (
    select
      gv.id,
      gv.user_id,
      gv.gym_id,
      gv.gym_name,
      gv.method,
      gv.checked_in_at
    from public.gym_visits gv
    order by gv.checked_in_at desc
    limit p_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'user_id', r.user_id,
      'gym_id', r.gym_id,
      'gym_name', r.gym_name,
      'method', r.method,
      'checked_in_at', r.checked_in_at,
      'full_name', p.full_name,
      'phone', p.phone,
      'avatar_path', p.avatar_path,
      'membership_status', p.membership_status,
      'membership_expires_at', p.membership_expires_at,
      'user_total', coalesce(a.user_total, 0),
      'user_last_visit_at', a.user_last_visit_at
    )
    order by r.checked_in_at desc
  ), '[]'::jsonb)
  into v_visits
  from recent r
  left join public.profiles p on p.id = r.user_id
  left join agg a on a.user_id = r.user_id;

  return jsonb_build_object('stats', v_stats, 'visits', v_visits);
end;
$$;

grant execute on function public.admin_visits_overview(int) to authenticated;

comment on function public.admin_visits_overview(int) is
  'Админ Ирц хуудас (Бүх ирц): нэг дуудалтаар толгойн статистик (rejected тооцохгүй, Монголын цагаар) болон сүүлийн p_limit ирц + хэрэглэгчийн профайл/нийт ирц/сүүлд ирсэн. Зөвхөн admin/moderator.';
