-- Per-user gym visit stats for the admin Users page.
-- Returns one row per requested user_id (only users that have at least one
-- non-rejected check-in are returned; the client treats missing users as zeros).
--
-- All calendar boundaries use Mongolia local time (Asia/Ulaanbaatar, UTC+8).
-- "Rejected" check-ins are excluded everywhere (pending + approved count).

create index if not exists idx_gym_visits_user_checked_in
  on public.gym_visits (user_id, checked_in_at desc)
  where status <> 'rejected';

create or replace function public.admin_user_visit_stats(p_user_ids uuid[])
returns table (
  user_id        uuid,
  total          integer,
  this_month     integer,
  this_week      integer,
  last_visit_at  timestamptz,
  last_gym_name  text,
  streak_days    integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin/moderator only — this function bypasses RLS (security definer).
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role in ('admin', 'moderator')
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with v as (
    select
      gv.user_id,
      gv.checked_in_at,
      gv.gym_name,
      (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date as local_day
    from public.gym_visits gv
    where gv.user_id = any(p_user_ids)
      and gv.status <> 'rejected'
  ),
  agg as (
    select
      v.user_id,
      count(*)::int as total,
      count(*) filter (
        where v.local_day >= date_trunc('month', (now() at time zone 'Asia/Ulaanbaatar'))::date
      )::int as this_month,
      count(*) filter (
        where v.checked_in_at >= now() - interval '7 days'
      )::int as this_week
    from v
    group by v.user_id
  ),
  last_visit as (
    select distinct on (v.user_id)
      v.user_id, v.checked_in_at, v.gym_name
    from v
    order by v.user_id, v.checked_in_at desc
  ),
  -- Distinct visit days per user, grouped into consecutive-day "islands":
  -- (local_day - row_number) is constant within a run of consecutive days.
  days as (
    select distinct v.user_id, v.local_day from v
  ),
  islands as (
    select
      d.user_id,
      d.local_day,
      d.local_day - (row_number() over (
        partition by d.user_id order by d.local_day
      ))::int as grp
    from days d
  ),
  runs as (
    select
      i.user_id,
      max(i.local_day) as run_end,
      count(*)::int    as run_len
    from islands i
    group by i.user_id, i.grp
  ),
  -- Streak = length of the run ending today or yesterday (Mongolia time);
  -- otherwise 0. Only one such run can exist per user.
  streak as (
    select r.user_id, r.run_len
    from runs r
    where r.run_end >= (now() at time zone 'Asia/Ulaanbaatar')::date - 1
  )
  select
    a.user_id,
    a.total,
    a.this_month,
    a.this_week,
    lv.checked_in_at as last_visit_at,
    lv.gym_name      as last_gym_name,
    coalesce(s.run_len, 0) as streak_days
  from agg a
  left join last_visit lv on lv.user_id = a.user_id
  left join streak s on s.user_id = a.user_id;
end;
$$;

grant execute on function public.admin_user_visit_stats(uuid[]) to authenticated;

comment on function public.admin_user_visit_stats(uuid[]) is
  'Админ Users хуудас: хэрэглэгч тус бүрийн ирцийн статистик (нийт/энэ сар/энэ долоо хоног/сүүлд ирсэн/streak). Монголын цагаар (UTC+8), rejected ирцийг тооцохгүй. Зөвхөн admin/moderator.';
