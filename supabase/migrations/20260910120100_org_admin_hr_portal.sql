-- HR (байгууллагын админ) портал.
-- gym_staff (user ↔ gym) загвартай ижил: org_admins (user ↔ organization).
-- HR зөвхөн өөрийн байгууллагын ажилчдын ирц/багцыг харна.
-- Бүх огнооны хил Монголын цагаар (Asia/Ulaanbaatar, UTC+8).

-- ─── Хүснэгт ────────────────────────────────────────────────────────────────

create table if not exists public.org_admins (
  user_id         uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role            text not null default 'hr' check (role in ('hr', 'owner')),
  created_at      timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create index if not exists idx_org_admins_organization on public.org_admins (organization_id);

comment on table public.org_admins is
  'HR / байгууллагын админ эрх: хэрэглэгч аль байгууллагын ажилчдыг харах эрхтэйг тодорхойлно.';

-- Тайлангийн query-д шаардлагатай индексүүд
create index if not exists idx_profiles_organization_id on public.profiles (organization_id);
create index if not exists idx_gym_visits_user_checked_in on public.gym_visits (user_id, checked_in_at desc);

-- ─── RLS: өөрийн мөрөө л уншина, бичих нь зөвхөн service role ──────────────

alter table public.org_admins enable row level security;

drop policy if exists org_admins_select_own on public.org_admins;
create policy org_admins_select_own on public.org_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_full_admin());

-- ─── Тусламжийн функц ──────────────────────────────────────────────────────

-- Хандах эрхтэй эсэх. service_role-ийг JWT claim-аар нь таньна — `auth.uid() is null`
-- гэж шалгаж БОЛОХГҮЙ: нэвтрээгүй (anon) дуудагчийн uid бас null байдаг тул
-- тэр нь хаалга онгойлгоно.
create or replace function public.can_read_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) = 'service_role'
    or public.is_full_admin()
    or exists (
      select 1 from public.org_admins oa
       where oa.user_id = auth.uid()
         and oa.organization_id = p_org
    );
$$;

-- ─── Тойм: статистик + ажилчдын жагсаалт ───────────────────────────────────

create or replace function public.org_admin_overview(
  p_org  uuid,
  p_from date,
  p_to   date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  v_stats   jsonb;
  v_daily   jsonb;
  v_gyms    jsonb;
  v_members jsonb;
begin
  if not public.can_read_org(p_org) then
    raise exception 'not authorized';
  end if;

  with emp as (
    select p.id from public.profiles p where p.organization_id = p_org
  ),
  v as (
    select
      gv.user_id,
      gv.gym_id,
      gv.gym_name,
      (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date as local_day
    from public.gym_visits gv
    join emp e on e.id = gv.user_id
    where gv.status is distinct from 'rejected'
  ),
  ranged as (
    select * from v where local_day between p_from and p_to
  ),
  by_day as (
    select local_day, count(*)::int as c from ranged group by local_day
  ),
  by_gym as (
    select gym_id, max(gym_name) as gym_name, count(*)::int as c
    from ranged group by gym_id order by c desc limit 10
  )
  select
    jsonb_build_object(
      'employees_total', (select count(*)::int from emp),
      'members_active', (
        select count(*)::int
          from public.profiles p
         where p.organization_id = p_org
           and p.membership_status = 'active'
           and (p.membership_expires_at is null or p.membership_expires_at >= now())
      ),
      'visits_range', (select count(*)::int from ranged),
      'visits_today', (select count(*)::int from v where local_day = v_today),
      'active_users_range', (select count(distinct user_id)::int from ranged)
    ),
    coalesce(
      (select jsonb_agg(jsonb_build_object('day', d.local_day, 'count', d.c) order by d.local_day) from by_day d),
      '[]'::jsonb
    ),
    coalesce(
      (select jsonb_agg(jsonb_build_object('gym_id', g.gym_id, 'gym_name', g.gym_name, 'count', g.c) order by g.c desc) from by_gym g),
      '[]'::jsonb
    )
  into v_stats, v_daily, v_gyms;

  -- Ажилчдын жагсаалт + нэгтгэсэн ирц
  with agg as (
    select
      gv.user_id,
      count(*)::int as visits_total,
      count(*) filter (
        where (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
      )::int as visits_range,
      max(gv.checked_in_at) as last_visit_at
    from public.gym_visits gv
    join public.profiles pr on pr.id = gv.user_id
    where pr.organization_id = p_org
      and gv.status is distinct from 'rejected'
    group by gv.user_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'surname', p.surname,
      'given_name', p.given_name,
      'phone', p.phone,
      'sap_number', p.sap_number,
      'avatar_path', p.avatar_path,
      'membership_status', p.membership_status,
      'membership_tier', p.membership_tier,
      'membership_started_at', p.membership_started_at,
      'membership_expires_at', p.membership_expires_at,
      'visits_total', coalesce(a.visits_total, 0),
      'visits_range', coalesce(a.visits_range, 0),
      'last_visit_at', a.last_visit_at
    )
    order by coalesce(a.visits_range, 0) desc, p.full_name asc
  ), '[]'::jsonb)
  into v_members
  from public.profiles p
  left join agg a on a.user_id = p.id
  where p.organization_id = p_org;

  return jsonb_build_object(
    'stats', v_stats,
    'daily', v_daily,
    'top_gyms', v_gyms,
    'members', v_members
  );
end;
$$;

comment on function public.org_admin_overview(uuid, date, date) is
  'HR портал: тухайн байгууллагын статистик, өдрийн ирцийн цуваа, топ фитнесүүд, ажилчдын жагсаалт. Зөвхөн org_admins/админ/service role.';

-- ─── Ирцийн түүх (хуудаслалттай) ───────────────────────────────────────────

create or replace function public.org_admin_visits(
  p_org    uuid,
  p_from   date,
  p_to     date,
  p_limit  int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total  int;
  v_visits jsonb;
begin
  if not public.can_read_org(p_org) then
    raise exception 'not authorized';
  end if;

  select count(*)::int
    into v_total
  from public.gym_visits gv
  join public.profiles p on p.id = gv.user_id
  where p.organization_id = p_org
    and gv.status is distinct from 'rejected'
    and (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'user_id', r.user_id,
      'gym_id', r.gym_id,
      'gym_name', r.gym_name,
      'method', r.method,
      'checked_in_at', r.checked_in_at,
      'full_name', r.full_name,
      'phone', r.phone,
      'sap_number', r.sap_number,
      'avatar_path', r.avatar_path
    )
    order by r.checked_in_at desc
  ), '[]'::jsonb)
  into v_visits
  from (
    select
      gv.id, gv.user_id, gv.gym_id, gv.gym_name, gv.method, gv.checked_in_at,
      p.full_name, p.phone, p.sap_number, p.avatar_path
    from public.gym_visits gv
    join public.profiles p on p.id = gv.user_id
    where p.organization_id = p_org
      and gv.status is distinct from 'rejected'
      and (gv.checked_in_at at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
    order by gv.checked_in_at desc
    limit greatest(1, least(p_limit, 1000))
    offset greatest(0, p_offset)
  ) r;

  return jsonb_build_object('total', v_total, 'visits', v_visits);
end;
$$;

comment on function public.org_admin_visits(uuid, date, date, int, int) is
  'HR портал: байгууллагын ажилчдын ирцийн түүх (аль фитнест, хэзээ), хуудаслалттай.';

-- PostgreSQL функцэд анхдагчаар PUBLIC-т EXECUTE өгдөг тул эхлээд хасна,
-- эс тэгвээс anon (нэвтрээгүй) дуудагч шууд ажиллуулж чадна.
revoke execute on function public.can_read_org(uuid) from public, anon;
revoke execute on function public.org_admin_overview(uuid, date, date) from public, anon;
revoke execute on function public.org_admin_visits(uuid, date, date, int, int) from public, anon;

grant execute on function public.can_read_org(uuid) to authenticated, service_role;
grant execute on function public.org_admin_overview(uuid, date, date) to authenticated, service_role;
grant execute on function public.org_admin_visits(uuid, date, date, int, int) to authenticated, service_role;
