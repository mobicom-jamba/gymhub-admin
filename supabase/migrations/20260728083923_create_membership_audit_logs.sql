-- Membership өөрчлөлтийн audit log: profiles дээрх membership_* талбарууд
-- солигдох бүрд автоматаар бүртгэнэ (админ засвар, төлбөр идэвхжүүлэлт, pause г.м.).

create table if not exists public.membership_audit_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  changed_by uuid references public.profiles (id) on delete set null,
  old_membership_tier text,
  new_membership_tier text,
  old_membership_status text,
  new_membership_status text,
  old_membership_started_at timestamptz,
  new_membership_started_at timestamptz,
  old_membership_expires_at timestamptz,
  new_membership_expires_at timestamptz,
  source text not null default 'trigger',
  created_at timestamptz not null default now()
);

create index if not exists idx_membership_audit_logs_created_at
  on public.membership_audit_logs (created_at desc);

create index if not exists idx_membership_audit_logs_profile_id
  on public.membership_audit_logs (profile_id, created_at desc);

create index if not exists idx_membership_audit_logs_changed_by
  on public.membership_audit_logs (changed_by, created_at desc);

comment on table public.membership_audit_logs is
  'Гишүүнчлэлийн (membership_*) өөрчлөлтийн audit бүртгэл.';

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

    -- Шинэ профайл membership хоосон бол бүртгэхгүй
    if new_tier is null
       and new_status is null
       and new_started is null
       and new_expires is null then
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

-- Админ API (service_role) өөрчилсний дараа changed_by-г хамааруулах
create or replace function public.attribute_latest_membership_audit(
  p_profile_id uuid,
  p_actor_id uuid,
  p_source text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_profile_id is null or p_actor_id is null then
    return;
  end if;

  select id into v_id
  from public.membership_audit_logs
  where profile_id = p_profile_id
    and changed_by is null
    and created_at >= now() - interval '15 seconds'
  order by created_at desc
  limit 1;

  if v_id is null then
    return;
  end if;

  update public.membership_audit_logs
  set changed_by = p_actor_id,
      source = coalesce(nullif(trim(p_source), ''), 'admin')
  where id = v_id;
end;
$$;

revoke all on function public.attribute_latest_membership_audit(uuid, uuid, text) from public;
grant execute on function public.attribute_latest_membership_audit(uuid, uuid, text) to service_role;

drop trigger if exists trg_log_membership_profile_changes on public.profiles;
create trigger trg_log_membership_profile_changes
  after insert or update of
    membership_tier,
    membership_status,
    membership_started_at,
    membership_expires_at
  on public.profiles
  for each row
  execute function public.log_membership_profile_changes();

alter table public.membership_audit_logs enable row level security;

drop policy if exists "staff_read_membership_audit_logs" on public.membership_audit_logs;
create policy "staff_read_membership_audit_logs"
  on public.membership_audit_logs
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'moderator', 'sales')
    )
  );

-- Insert зөвхөн trigger / service_role (SECURITY DEFINER) хийнэ
revoke insert, update, delete on public.membership_audit_logs from authenticated, anon;
grant select on public.membership_audit_logs to authenticated;
