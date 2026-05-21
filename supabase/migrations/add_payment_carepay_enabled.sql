-- Carepay payment channel toggle for payment_app_settings
alter table public.payment_app_settings
  add column if not exists payment_carepay_enabled boolean not null default true;

comment on column public.payment_app_settings.payment_carepay_enabled is 'Carepay зээлээр төлөх суваг (апп + API)';
