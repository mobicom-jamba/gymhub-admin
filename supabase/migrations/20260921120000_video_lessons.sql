-- Видео хичээл (Cloudflare Stream дээр байршина).
-- Файл өөрөө DB-д хадгалагдахгүй: Cloudflare Stream дээрх видеоны uid болон
-- тоглуулах суваг (HLS/DASH) л хадгалагдана. Бүх хүргэлт signed token-оор
-- явах тул (requireSignedURLs=true) линк тараасан ч хугацаа нь дуусна.

create table if not exists public.video_lessons (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  category         text not null default 'fitness',
  level            text not null default 'all'
                     check (level in ('all', 'beginner', 'intermediate', 'advanced')),
  trainer_name     text,

  -- Cloudflare Stream
  cf_uid           text unique,
  cf_status        text not null default 'pending'
                     check (cf_status in ('pending', 'uploading', 'processing', 'ready', 'error')),
  cf_error         text,
  duration_seconds integer,
  -- Cloudflare-ийн playback суурь URL (customer-<code>.cloudflarestream.com/<uid>/...).
  -- Signed URL үүсгэхдээ <uid>-ийн оронд token-оо тавьж ашиглана.
  cf_hls_url       text,

  is_published     boolean not null default false,
  -- 'members' → зөвхөн идэвхтэй гишүүнчлэлтэй хэрэглэгч, 'public' → нэвтэрсэн бүх хүн.
  access_level     text not null default 'members'
                     check (access_level in ('members', 'public')),
  sort_order       integer not null default 0,
  view_count       integer not null default 0,

  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.video_lessons is
  'Видео хичээлийн каталог. Видео файл Cloudflare Stream дээр, энд зөвхөн мета мэдээлэл.';

create index if not exists idx_video_lessons_published
  on public.video_lessons (is_published, sort_order, created_at desc);
create index if not exists idx_video_lessons_category on public.video_lessons (category);

-- updated_at автоматаар
create or replace function public.touch_video_lesson()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_video_lessons_touch on public.video_lessons;
create trigger trg_video_lessons_touch
  before update on public.video_lessons
  for each row execute function public.touch_video_lesson();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Бичих нь зөвхөн service role (API route)-оор. Унших нь нийтлэгдсэн мөр л.
-- Гишүүнчлэлийн шалгалт API талд хийгдэнэ — энэ давхарга зөвхөн шууд
-- client-ээс хандахаас хамгаална.

alter table public.video_lessons enable row level security;

drop policy if exists video_lessons_select_published on public.video_lessons;
create policy video_lessons_select_published on public.video_lessons
  for select to authenticated
  using (is_published or public.is_full_admin());

-- ─── Үзэлтийн тоолуур ───────────────────────────────────────────────────────

create or replace function public.increment_video_lesson_view(p_lesson uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.video_lessons
     set view_count = view_count + 1
   where id = p_lesson
     and is_published;
$$;

revoke all on function public.increment_video_lesson_view(uuid) from public;
grant execute on function public.increment_video_lesson_view(uuid) to authenticated, service_role;
