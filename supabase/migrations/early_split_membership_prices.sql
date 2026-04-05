-- Early гишүүнчлэл: эхний сар + үлдсэн 11 сар (тусдаа үнэ)
alter table public.payment_app_settings
  add column if not exists early_first_month_price_mnt integer not null default 150000;

alter table public.payment_app_settings
  add column if not exists early_remainder_price_mnt integer not null default 330000;

comment on column public.payment_app_settings.early_first_month_price_mnt is 'Early: эхний 1 сарын төлбөр (жишээ 150,000₮)';
comment on column public.payment_app_settings.early_remainder_price_mnt is 'Early: үлдсэн 11 сар (жишээ 330,000₮; дуусах огноо = эхний сар эхэлснээс 1 жил)';
comment on column public.payment_app_settings.early_membership_price_mnt is 'Legacy: нэг дор Early жилийн төлбөр (хуучин membership-early-<ts> нэхэмжлэл)';
