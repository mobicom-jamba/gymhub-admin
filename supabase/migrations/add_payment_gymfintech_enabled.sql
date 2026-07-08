-- GymFinTech payment channel toggle for payment_app_settings
alter table public.payment_app_settings
  add column if not exists payment_gymfintech_enabled boolean not null default true;

comment on column public.payment_app_settings.payment_gymfintech_enabled is 'GymFinTech хүүгүй хуваан төлөлтийн суваг (дотоод)';
