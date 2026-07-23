-- Profiles: moderators may SELECT all rows (via is_admin()), but only full admins may UPDATE others.
-- App permissions: moderator has users.view only (no users.manage).

create or replace function public.is_full_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

comment on function public.is_full_admin() is
  'True only for role = admin (write/manage elevated RLS). Moderators use is_admin() for read.';

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles
for update
using (public.is_full_admin());

drop policy if exists "Admins can update profiles organization_id" on public.profiles;
create policy "Admins can update profiles organization_id"
on public.profiles
for update
using (public.is_full_admin());
