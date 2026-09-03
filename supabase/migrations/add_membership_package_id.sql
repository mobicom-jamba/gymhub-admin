-- Хэрэглэгчийн одоогийн багцын id (upgrade зөрүү зөв тооцох). Smart ба Standard хоёулаа
-- membership_tier='standard' болдог тул tier-ээр ялгах боломжгүй — package_id хэрэгтэй.
alter table public.profiles
  add column if not exists membership_package_id text;

-- Гишүүн өөрөө membership_package_id-гаа засахаас сэргийлнэ (зөвхөн admin/service role).
create or replace function public.guard_membership_self_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  membership_changed boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_full_admin() then
    return new;
  end if;

  membership_changed :=
    new.membership_tier is distinct from old.membership_tier
    or new.membership_status is distinct from old.membership_status
    or new.membership_started_at is distinct from old.membership_started_at
    or new.membership_expires_at is distinct from old.membership_expires_at
    or new.membership_package_id is distinct from old.membership_package_id;

  if not membership_changed then
    return new;
  end if;

  if old.membership_started_at is null
     and old.membership_expires_at is null
     and new.membership_started_at is null
     and new.membership_expires_at is null
     and coalesce(new.membership_status, 'inactive') = 'inactive' then
    new.membership_status := 'inactive';
    return new;
  end if;

  new.membership_tier := old.membership_tier;
  new.membership_status := old.membership_status;
  new.membership_started_at := old.membership_started_at;
  new.membership_expires_at := old.membership_expires_at;
  new.membership_package_id := old.membership_package_id;
  return new;
end;
$function$;
