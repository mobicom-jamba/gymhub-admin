-- 7 хоногийн зочлох эрхийн лимит.
-- profiles.weekly_visit_limit: NULL = хуучин дүрэм (өдөрт 1 удаа), утгатай = долоо хоногт тухайн тоогоор хязгаарлана.
-- Зөвхөн шинээр багц идэвхжих үед (service role) тавигдана; хуучин хэрэглэгчид NULL хэвээр.

alter table public.profiles
  add column if not exists weekly_visit_limit smallint;

-- Энгийн хэрэглэгч өөрөө weekly_visit_limit-ээ засахаас сэргийлнэ (зөвхөн admin/service role тавьж чадна).
create or replace function public.guard_profile_privileged_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  org_ok boolean := false;
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_full_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.sales_referred_by := null;
    new.weekly_visit_limit := null;
    new.membership_started_at := null;
    new.membership_expires_at := null;
    if coalesce(new.membership_status, 'inactive') <> 'inactive' then
      new.membership_status := 'inactive';
    end if;

    if new.region is not null and new.region not in ('ulaanbaatar', 'darkhan') then
      new.region := null;
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

    return new;
  end if;

  new.role := old.role;
  new.sales_referred_by := old.sales_referred_by;
  new.weekly_visit_limit := old.weekly_visit_limit;

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
    null;
  else
    new.sap_number := old.sap_number;
  end if;

  -- region: нэг удаа бөглөнө; дараа нь гишүүн солихгүй
  if old.region is null and new.region is not null then
    if new.region not in ('ulaanbaatar', 'darkhan') then
      new.region := null;
    end if;
  else
    new.region := old.region;
  end if;

  return new;
end;
$function$;
