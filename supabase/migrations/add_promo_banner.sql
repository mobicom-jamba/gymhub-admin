-- Admin-аас удирддаг промо banner (нэг banner). JSONB нэг багана.
alter table public.payment_app_settings
  add column if not exists banner jsonb not null default '{}'::jsonb;
