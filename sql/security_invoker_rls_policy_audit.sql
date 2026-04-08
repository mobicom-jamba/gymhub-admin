-- Fix Supabase advisory:
-- "View public.rls_policy_audit is defined with the SECURITY DEFINER property"
--
-- Run this in Supabase SQL editor.

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'rls_policy_audit'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.rls_policy_audit set (security_invoker = true)';
  end if;
end
$$;
