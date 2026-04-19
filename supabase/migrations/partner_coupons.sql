-- Партнер купон: одоо байгаа `coupons` хүснэгтийг партнер купон дэмжих болгож өргөтгөх.
-- "column coupons.partner_name does not exist" гэх мэт алдаа гарвал энэ миграцийг ажиллуулна.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coupons
  add column if not exists partner_name text not null default '',
  add column if not exists partner_logo_url text,
  add column if not exists discount_percent integer not null default 0,
  add column if not exists view_count integer not null default 0,
  add column if not exists required_tier text not null default 'premium',
  add column if not exists updated_at timestamptz;

alter table public.coupons
  drop constraint if exists coupons_discount_percent_chk;
alter table public.coupons
  add constraint coupons_discount_percent_chk
    check (discount_percent >= 0 and discount_percent <= 100);

create index if not exists coupons_is_active_idx
  on public.coupons (is_active, created_at desc)
  where is_active = true;

-- View count-г атомарлаг өсгөх RPC. Клиент талаас `supabase.rpc('increment_coupon_view')` гэж дуудна.
create or replace function public.increment_coupon_view(coupon_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coupons
     set view_count = coalesce(view_count, 0) + 1
   where id = coupon_id;
$$;

grant execute on function public.increment_coupon_view(uuid) to authenticated;

-- RLS: Нэвтэрсэн хэрэглэгч зөвхөн идэвхтэй купон уншина. Админ/модератор буюу API route (service role) бичиж устгана.
alter table public.coupons enable row level security;

drop policy if exists coupons_select_active on public.coupons;
create policy coupons_select_active
  on public.coupons
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all
  on public.coupons
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('admin', 'moderator')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('admin', 'moderator')
    )
  );

comment on table public.coupons is 'Партнер купон: Premium гишүүдэд үзүүлэх брэндийн хөнгөлөлт.';
comment on function public.increment_coupon_view(uuid) is 'Купон харагдсан тоог атомарлаг өсгөх (Premium хэрэглэгчийн дэлгэц нээхэд).';
