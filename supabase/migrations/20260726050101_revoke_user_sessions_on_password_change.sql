-- Revoke all Auth sessions for a user (password change → logout all devices).
-- Callable only with service_role from admin API routes.

create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;

-- Used by API auth to reject JWTs whose session was revoked (e.g. after password change).
create or replace function public.is_auth_session_active(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from auth.sessions where id = p_session_id
  );
$$;

revoke all on function public.is_auth_session_active(uuid) from public, anon, authenticated;
grant execute on function public.is_auth_session_active(uuid) to service_role;
