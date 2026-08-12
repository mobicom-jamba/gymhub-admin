-- Signup-д сонгосон байгууллага/SAP хадгалагдах болгоно.
-- 1) handle_new_user: auth metadata-аас org/sap/phone/нэр авна
-- 2) guard: INSERT-д зөв org зөвшөөрнө; UPDATE-д зөвхөн хоосон байсан бол нэг удаа тохируулна

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  meta_org_id text := nullif(trim(coalesce(meta->>'organization_id', '')), '');
  meta_org_name text := nullif(trim(coalesce(meta->>'organization_name', meta->>'organization', '')), '');
  meta_sap text := nullif(trim(coalesce(meta->>'sap_number', '')), '');
  meta_phone text := nullif(trim(coalesce(meta->>'phone', '')), '');
  meta_surname text := nullif(trim(coalesce(meta->>'surname', '')), '');
  meta_given text := nullif(trim(coalesce(meta->>'given_name', '')), '');
  meta_full text := nullif(trim(coalesce(meta->>'full_name', '')), '');
  resolved_org_id uuid := null;
  resolved_org_name text := null;
begin
  if meta_org_id is not null then
    begin
      resolved_org_id := meta_org_id::uuid;
    exception when others then
      resolved_org_id := null;
    end;
    if resolved_org_id is not null then
      select o.id, o.name
        into resolved_org_id, resolved_org_name
      from public.organizations o
      where o.id = resolved_org_id
      limit 1;
      if resolved_org_id is null then
        resolved_org_name := null;
      else
        resolved_org_name := coalesce(meta_org_name, resolved_org_name);
      end if;
    end if;
  end if;

  insert into public.profiles (
    id,
    full_name,
    surname,
    given_name,
    avatar_url,
    phone,
    organization_id,
    organization,
    sap_number,
    role,
    membership_status
  )
  values (
    new.id,
    coalesce(meta_full, ''),
    meta_surname,
    meta_given,
    coalesce(meta->>'avatar_url', ''),
    meta_phone,
    resolved_org_id,
    resolved_org_name,
    meta_sap,
    'user',
    'inactive'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_ok boolean := false;
begin
  -- service_role / no JWT
  if auth.uid() is null then
    return new;
  end if;

  if public.is_full_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.sales_referred_by := null;
    new.membership_started_at := null;
    new.membership_expires_at := null;
    if coalesce(new.membership_status, 'inactive') <> 'inactive' then
      new.membership_status := 'inactive';
    end if;

    if new.organization_id is not null then
      select exists(
        select 1 from public.organizations o where o.id = new.organization_id
      ) into org_ok;
      if not org_ok then
        new.organization_id := null;
        new.organization := null;
      elsif new.organization is null or length(trim(new.organization)) = 0 then
        select o.name into new.organization
        from public.organizations o
        where o.id = new.organization_id;
      end if;
    else
      new.organization := null;
    end if;

    -- sap_number: signup metadata-аас ирсэн бол үлдээнэ
    return new;
  end if;

  -- UPDATE: freeze privileged columns for non-admin,
  -- except one-time organization / sap fill when previously empty.
  new.role := old.role;
  new.sales_referred_by := old.sales_referred_by;

  if old.organization_id is null and new.organization_id is not null then
    select exists(
      select 1 from public.organizations o where o.id = new.organization_id
    ) into org_ok;
    if not org_ok then
      new.organization_id := null;
      new.organization := null;
    elsif new.organization is null or length(trim(new.organization)) = 0 then
      select o.name into new.organization
      from public.organizations o
      where o.id = new.organization_id;
    end if;
  else
    new.organization_id := old.organization_id;
    new.organization := old.organization;
  end if;

  if old.sap_number is null and new.sap_number is not null and length(trim(new.sap_number)) > 0 then
    -- keep new.sap_number (one-time)
    null;
  else
    new.sap_number := old.sap_number;
  end if;

  return new;
end;
$$;
