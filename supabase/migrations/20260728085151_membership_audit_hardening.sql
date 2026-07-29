-- 1) Бүртгэлийн default шуугиан audit-д бичихгүй
-- 2) Гишүүн өөрөө membership_status / огноо солихыг хориглоно
--    (төлөөгүй үед зөвхөн membership_tier сонгохыг зөвшөөрнө)
-- 3) Default status: active → inactive

-- Default-ийг илүү зөв болгох (шинэ бүртгэл false-active болохгүй)
alter table public.profiles
  alter column membership_status set default 'inactive';

create or replace function public.log_membership_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  old_tier text;
  new_tier text;
  old_status text;
  new_status text;
  old_started timestamptz;
  new_started timestamptz;
  old_expires timestamptz;
  new_expires timestamptz;
begin
  if tg_op = 'INSERT' then
    old_tier := null;
    old_status := null;
    old_started := null;
    old_expires := null;
    new_tier := new.membership_tier::text;
    new_status := new.membership_status::text;
    new_started := new.membership_started_at;
    new_expires := new.membership_expires_at;

    -- Хоосон эсвэл зөвхөн default status → бүртгэлийн шуугиан, алгасна
    if new_tier is null
       and new_started is null
       and new_expires is null
       and (new_status is null or new_status in ('active', 'inactive')) then
      return new;
    end if;
  else
    old_tier := old.membership_tier::text;
    old_status := old.membership_status::text;
    old_started := old.membership_started_at;
    old_expires := old.membership_expires_at;
    new_tier := new.membership_tier::text;
    new_status := new.membership_status::text;
    new_started := new.membership_started_at;
    new_expires := new.membership_expires_at;

    if old_tier is not distinct from new_tier
       and old_status is not distinct from new_status
       and old_started is not distinct from new_started
       and old_expires is not distinct from new_expires then
      return new;
    end if;
  end if;

  insert into public.membership_audit_logs (
    profile_id,
    changed_by,
    old_membership_tier,
    new_membership_tier,
    old_membership_status,
    new_membership_status,
    old_membership_started_at,
    new_membership_started_at,
    old_membership_expires_at,
    new_membership_expires_at,
    source
  ) values (
    new.id,
    actor,
    old_tier,
    new_tier,
    old_status,
    new_status,
    old_started,
    new_started,
    old_expires,
    new_expires,
    case
      when actor is not null then 'user'
      else 'system'
    end
  );

  return new;
end;
$$;

-- Гишүүн өөрийн JWT-ээр membership идэвхжүүлэх / огноо солихыг хориглоно.
-- Төлөөгүй үед (огноо хоосон, status inactive) зөвхөн багц (tier) сонгохыг зөвшөөрнө.
create or replace function public.guard_membership_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_changed boolean;
begin
  -- service_role / trigger without JWT → зөвшөөрнө (төлбөр, админ API)
  if auth.uid() is null then
    return new;
  end if;

  -- Бүтэн админ → зөвшөөрнө
  if public.is_full_admin() then
    return new;
  end if;

  membership_changed :=
    new.membership_tier is distinct from old.membership_tier
    or new.membership_status is distinct from old.membership_status
    or new.membership_started_at is distinct from old.membership_started_at
    or new.membership_expires_at is distinct from old.membership_expires_at;

  if not membership_changed then
    return new;
  end if;

  -- Төлөөгүй багц сонголт: огноо хоосон, status = inactive → tier солихыг зөвшөөрнө
  if old.membership_started_at is null
     and old.membership_expires_at is null
     and new.membership_started_at is null
     and new.membership_expires_at is null
     and coalesce(new.membership_status, 'inactive') = 'inactive' then
    new.membership_status := 'inactive';
    return new;
  end if;

  -- Бусад membership өөрчлөлтийг буцааж хуучин утга руу сэргээнэ
  new.membership_tier := old.membership_tier;
  new.membership_status := old.membership_status;
  new.membership_started_at := old.membership_started_at;
  new.membership_expires_at := old.membership_expires_at;
  return new;
end;
$$;

drop trigger if exists trg_guard_membership_self_edit on public.profiles;
create trigger trg_guard_membership_self_edit
  before update of
    membership_tier,
    membership_status,
    membership_started_at,
    membership_expires_at
  on public.profiles
  for each row
  execute function public.guard_membership_self_edit();

-- Хуучин бүртгэлийн шуугиан мөрүүдийг цэвэрлэх (admin биш, төлбөргүй signup noise)
delete from public.membership_audit_logs
where booking_id is null
  and payment_channel is null
  and source in ('system', 'user')
  and old_membership_started_at is null
  and new_membership_started_at is null
  and old_membership_expires_at is null
  and new_membership_expires_at is null
  and (
    (source = 'system' and old_membership_status is null and new_membership_status in ('active', 'inactive') and new_membership_tier is null)
    or
    (source = 'user'
      and changed_by = profile_id
      and old_membership_started_at is null
      and coalesce(new_membership_status, 'inactive') = 'inactive')
  );
