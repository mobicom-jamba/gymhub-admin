-- Dynamic membership packages (admin table). Flat price/month columns sync-тэй үлдэнэ (backward compat).
alter table public.payment_app_settings
  add column if not exists packages jsonb;

comment on column public.payment_app_settings.packages is
  'Гишүүнчлэлийн багцууд [{id,name,price_mnt,months,pool_months,yoga_months,stored_tier,enabled,featured,sort_order,locked}]';
