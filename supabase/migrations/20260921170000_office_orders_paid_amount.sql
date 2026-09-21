-- Бодит төлөгдсөн дүнг хадгална: QPay-ээс ирсэн дүнг багцын үнэтэй тулгаж,
-- дутуу төлөлтийг «paid» гэж андуурахгүй. Орлогын тайлан үүнээс тооцогдоно.

alter table public.office_package_requests
  add column if not exists paid_amount integer;

alter table public.office_package_requests drop constraint if exists office_package_requests_status_check;

alter table public.office_package_requests
  add constraint office_package_requests_status_check
    check (status in ('pending_payment', 'paid', 'underpaid', 'cancelled'));

create index if not exists idx_office_requests_paid
  on public.office_package_requests (status, paid_at desc)
  where status = 'paid';
