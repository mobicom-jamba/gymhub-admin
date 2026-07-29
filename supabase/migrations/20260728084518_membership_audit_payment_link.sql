-- Audit log дээр төлбөрийн booking / channel холбох + attribute RPC өргөтгөх

alter table public.membership_audit_logs
  add column if not exists booking_id text,
  add column if not exists payment_channel text;

create index if not exists idx_membership_audit_logs_booking_id
  on public.membership_audit_logs (booking_id)
  where booking_id is not null;

comment on column public.membership_audit_logs.booking_id is
  'Төлбөрөөр идэвхжүүлсэн бол bookings.id (жишээ: membership-early-…)';
comment on column public.membership_audit_logs.payment_channel is
  'Төлбөрийн суваг: qpay, monpay, sono, carepay, gymfintech, …';

-- Хуучин 3-param overload-ийг арилгаад нэг функц үлдээнэ
drop function if exists public.attribute_latest_membership_audit(uuid, uuid, text);

create or replace function public.attribute_latest_membership_audit(
  p_profile_id uuid,
  p_actor_id uuid default null,
  p_source text default null,
  p_booking_id text default null,
  p_payment_channel text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_profile_id is null then
    return;
  end if;

  select id into v_id
  from public.membership_audit_logs
  where profile_id = p_profile_id
    and created_at >= now() - interval '30 seconds'
  order by created_at desc
  limit 1;

  if v_id is null then
    return;
  end if;

  update public.membership_audit_logs
  set
    changed_by = coalesce(p_actor_id, changed_by),
    source = coalesce(nullif(trim(p_source), ''), source),
    booking_id = coalesce(nullif(trim(p_booking_id), ''), booking_id),
    payment_channel = coalesce(nullif(trim(p_payment_channel), ''), payment_channel)
  where id = v_id;
end;
$$;

revoke all on function public.attribute_latest_membership_audit(uuid, uuid, text, text, text) from public;
grant execute on function public.attribute_latest_membership_audit(uuid, uuid, text, text, text) to service_role;
