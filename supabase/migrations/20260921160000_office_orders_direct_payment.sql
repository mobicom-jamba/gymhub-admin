-- Оффис багц: захиалгын хүсэлт биш, QPay-ээр шууд төлдөг болов.
-- Нэхэмжлэлийн booking_id-г хадгалж, төлбөр орсон эсэхийг түүгээр тулгана.

alter table public.office_package_requests
  add column if not exists booking_id      text unique,
  add column if not exists qpay_invoice_id text,
  add column if not exists paid_at         timestamptz;

-- Хуучин төлвүүдийг төлбөрийн төлөв рүү буулгана.
alter table public.office_package_requests drop constraint if exists office_package_requests_status_check;

update public.office_package_requests
   set status = case when status in ('won') then 'paid' else 'pending_payment' end
 where status not in ('pending_payment', 'paid', 'cancelled');

alter table public.office_package_requests
  alter column status set default 'pending_payment',
  add constraint office_package_requests_status_check
    check (status in ('pending_payment', 'paid', 'cancelled'));

create index if not exists idx_office_requests_booking
  on public.office_package_requests (booking_id);

comment on table public.office_package_requests is
  'Оффис багцын захиалга: QPay нэхэмжлэл үүсгэж, төлөгдмөгц paid болно.';
