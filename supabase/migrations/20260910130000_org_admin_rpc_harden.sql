-- ЗАСВАР (аюулгүй байдал): HR порталын RPC-үүд нэвтрээгүй хэрэглэгчид нээлттэй байсан.
--
-- Хоёр алдаа давхцсан:
--   1) can_read_org доторх `auth.uid() is null` шалгалт service_role-ийг таних
--      зорилготой байсан ч, нэвтрээгүй (anon) дуудагчийн uid бас null байдаг.
--   2) PostgreSQL функц үүсгэхэд PUBLIC-т EXECUTE эрх анхдагчаар олгогддог тул
--      anon role шууд дуудаж чаддаг байв.
--
-- Үр дүнд нь anon key-тэй хэн ч дурын байгууллагын ажилчдын нэр/утас/SAP-ыг
-- татах боломжтой байсан. Энэ файл хоёуланг нь хаана.

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

revoke execute on function public.can_read_org(uuid) from public, anon;
revoke execute on function public.org_admin_overview(uuid, date, date) from public, anon;
revoke execute on function public.org_admin_visits(uuid, date, date, int, int) from public, anon;

grant execute on function public.can_read_org(uuid) to authenticated, service_role;
grant execute on function public.org_admin_overview(uuid, date, date) to authenticated, service_role;
grant execute on function public.org_admin_visits(uuid, date, date, int, int) to authenticated, service_role;

comment on function public.can_read_org(uuid) is
  'HR порталын эрхийн шалгалт. service_role-ийг JWT claim-аар таньдаг — auth.uid() null эсэхээр шалгаж болохгүй (anon бас null).';
