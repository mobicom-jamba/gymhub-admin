-- Багцын үндсэн эрх (фитнес) хугацаа — сараар. Төлбөр амжилттай болсны дараа membership_expires_at-д ашиглана.
alter table public.payment_app_settings
  add column if not exists smart1_months integer not null default 12,
  add column if not exists standard3_months integer not null default 6,
  add column if not exists premium_months integer not null default 12,
  add column if not exists premium4_months integer not null default 12,
  add column if not exists smart1_pool_months integer not null default 3,
  add column if not exists premium_yoga_months integer not null default 3,
  add column if not exists premium4_pool_months integer not null default 3,
  add column if not exists premium4_yoga_months integer not null default 3;

comment on column public.payment_app_settings.smart1_months is 'Premium 1: фитнес эрх (сар)';
comment on column public.payment_app_settings.standard3_months is 'Standard: фитнес эрх (сар)';
comment on column public.payment_app_settings.premium_months is 'Premium 2: фитнес эрх (сар)';
comment on column public.payment_app_settings.premium4_months is 'GymCore: фитнес эрх (сар)';
comment on column public.payment_app_settings.smart1_pool_months is 'Premium 1: бассейн нэмэлт (сар, зөвхөн харуулалт)';
comment on column public.payment_app_settings.premium_yoga_months is 'Premium 2: йог нэмэлт (сар, зөвхөн харуулалт)';
comment on column public.payment_app_settings.premium4_pool_months is 'GymCore: бассейн нэмэлт (сар, зөвхөн харуулалт)';
comment on column public.payment_app_settings.premium4_yoga_months is 'GymCore: йог нэмэлт (сар, зөвхөн харуулалт)';
