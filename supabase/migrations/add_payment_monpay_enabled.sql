alter table public.payment_app_settings
  add column if not exists payment_monpay_enabled boolean not null default true;

comment on column public.payment_app_settings.payment_monpay_enabled is 'MonPay мини апп төлбөрийн суваг (апп + API)';
