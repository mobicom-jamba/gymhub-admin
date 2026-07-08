-- Гишүүнчлэл идэвхжүүлэлтийн атом claim: bookings.id нь uuid тул "membership-early-<ts>"
-- маягийн string booking_id-г хадгалж чадахгүй байсан (22P02 invalid input syntax for type uuid),
-- үүнээс болж claimMembershipBooking() үргэлж "already" гэж буцаж, profiles хэзээ ч
-- шинэчлэгдэхгүй байсан. Энэ хүснэгт нь зөвхөн idempotency-д зориулагдсан, text PK-тай.

create table if not exists public.membership_activations (
  booking_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  applied_at timestamptz not null default now()
);

create index if not exists idx_membership_activations_user
  on public.membership_activations (user_id);

comment on table public.membership_activations is
  'membership-* booking_id тус бүрийг зөвхөн нэг л удаа идэвхжүүлэхийг баталгаажуулах atomic claim.';
