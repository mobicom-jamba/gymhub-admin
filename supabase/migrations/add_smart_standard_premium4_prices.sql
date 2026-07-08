-- 5 багцын систем: Smart-1, Smart-2 (= premium_membership_price_mnt), Standard-3, Premium-4, EARLY (= early_membership_price_mnt)
alter table public.payment_app_settings
  add column if not exists smart1_price_mnt numeric(14, 2) not null default 780000,
  add column if not exists standard3_price_mnt numeric(14, 2) not null default 480000,
  add column if not exists premium4_price_mnt numeric(14, 2) not null default 980000;

comment on column public.payment_app_settings.smart1_price_mnt is 'Smart багц-1: Fitness 1 жил + Бассейн 3 сар + Инбоди + Амар даатгал + Nova 10 хоног';
comment on column public.payment_app_settings.standard3_price_mnt is 'Standard багц-3: Fitness 6 сар';
comment on column public.payment_app_settings.premium4_price_mnt is 'Premium багц-4: Fitness 1 жил + Бассейн 3 сар + Иога 3 сар + Инбоди + Амар даатгал + Nova 10 хоног';
