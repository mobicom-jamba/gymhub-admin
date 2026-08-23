-- Dashboard → SQL Editor дээр нэг удаа ажиллуулна.
-- Шинэ бүртгэл: Улаанбаатар / орон нутаг; профайл зураг заавал 1 удаа.

alter table public.profiles
  add column if not exists region text;

comment on column public.profiles.region is
  'Бүртгэлийн бүс: ulaanbaatar | darkhan (орон нутаг / бүсчлэл). Хуучин хэрэглэгчид null байж болно.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_region_check'
  ) then
    alter table public.profiles
      add constraint profiles_region_check
      check (region is null or region in ('ulaanbaatar', 'darkhan'));
  end if;
end $$;

alter table public.payment_app_settings
  add column if not exists require_profile_avatar boolean not null default true;
