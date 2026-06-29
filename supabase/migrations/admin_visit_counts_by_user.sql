-- Per-member gym-visit counts for the admin Visits ("Ирц") page leaderboard.
-- One row per user that has at least one non-rejected check-in, ordered by total
-- visits descending. Mongolia local time (Asia/Ulaanbaatar, UTC+8). Admin/moderator only.

create or replace function public.admin_visit_counts_by_user()
returns table (
  user_id        uuid,
  full_name      text,
  phone          text,
  avatar_path    text,
  total          integer,
  this_month     integer,
  last_visit_at  timestamptz,
  last_gym_name  text
)
language plpgsql
security definer
set search_path = public
as $$
begin
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
    where gv.status <> 'rejected'
  ),
  agg as (
    select
      v.user_id,
      count(*)::int as total,
      count(*) filter (
        where v.local_day >= date_trunc('month', (now() at time zone 'Asia/Ulaanbaatar'))::date
      )::int as this_month
    from v
    group by v.user_id
  ),
  last_visit as (
    select distinct on (v.user_id)
      v.user_id, v.checked_in_at, v.gym_name
    from v
    order by v.user_id, v.checked_in_at desc
  )
  select
    a.user_id,
    p.full_name,
    p.phone,
    p.avatar_path,
    a.total,
    a.this_month,
    lv.checked_in_at as last_visit_at,
    lv.gym_name      as last_gym_name
  from agg a
  left join public.profiles p on p.id = a.user_id
  left join last_visit lv on lv.user_id = a.user_id
  order by a.total desc, lv.checked_in_at desc nulls last;
end;
$$;

grant execute on function public.admin_visit_counts_by_user() to authenticated;

comment on function public.admin_visit_counts_by_user() is
  'Админ Ирц хуудас: гишүүн тус бүрийн нийт ирцийн тоо (их->бага), Монголын цагаар, rejected тооцохгүй. Зөвхөн admin/moderator.';
