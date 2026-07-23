-- Moderators should see the same admin-readable data as admins (Users, visits, etc.).
-- App permissions already treat moderator ≈ admin except users.subscription.edit;
-- RLS was still gated on role = 'admin' only, so moderators only saw their own profile.

create or replace function public.is_admin()
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
      and role in ('admin', 'moderator')
  );
$$;

comment on function public.is_admin() is
  'True when the current auth user is admin or moderator (staff elevated RLS access).';
