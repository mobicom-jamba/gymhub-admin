-- Оффис (байгууллагын) багц.
-- Үнэ, нөхцлийг админаас удирдана; апп дээр зөвхөн харагдаж, захиалгын хүсэлт
-- үлдээнэ — 1-4 сая төгрөгийн байгууллагын гэрээг апп дотор шууд төлүүлэхгүй.

alter table public.payment_app_settings
  add column if not exists office_packages jsonb not null default '[]'::jsonb;

comment on column public.payment_app_settings.office_packages is
  'Оффис багцын жагсаалт: [{id,label,plan_key,plan_label,price_mnt,per_visit_mnt,enabled,sort_order}]';

create table if not exists public.office_package_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  package_id        text,
  package_label     text,
  plan_label        text,
  headcount         integer,
  price_mnt         integer,
  organization_name text not null,
  contact_name      text,
  contact_phone     text not null,
  contact_email     text,
  note              text,
  status            text not null default 'new'
                      check (status in ('new', 'contacted', 'won', 'lost')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.office_package_requests is
  'Оффис багцын захиалгын хүсэлт — аппаас ирж, админ холбогдоно.';

create index if not exists idx_office_requests_status
  on public.office_package_requests (status, created_at desc);

create or replace function public.touch_office_request()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_office_requests_touch on public.office_package_requests;
create trigger trg_office_requests_touch
  before update on public.office_package_requests
  for each row execute function public.touch_office_request();

-- RLS: бичих/уншихыг API (service role) дамжуулна. Хэрэглэгч өөрийн хүсэлтээ л харна.
alter table public.office_package_requests enable row level security;

drop policy if exists office_requests_select_own on public.office_package_requests;
create policy office_requests_select_own on public.office_package_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_full_admin());
