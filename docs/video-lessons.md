# Видео хичээл (Cloudflare Stream)

Админ панелаас видео хичээл хуулж, gymhub апп/вэбэд гишүүдэд үзүүлэх систем.
Видео файл Supabase-д ОРОХГҮЙ — Cloudflare Stream дээр байршиж, зөвхөн
хугацаатай (signed) холбоосоор тоглоно.

## Тохиргоо

1. Cloudflare dashboard → **Stream**-г идэвхжүүлнэ (хадгалалт ~$5/1000 минут,
   үзэлт ~$1/1000 минут).
2. Дараах орчны хувьсагчийг `.env.local` болон Vercel дээр нэмнэ:

   | Хувьсагч | Утга |
   | --- | --- |
   | `CLOUDFLARE_ACCOUNT_ID` | Stream хуудасны баруун талын Account ID |
   | `CLOUDFLARE_STREAM_API_TOKEN` | My Profile → API Tokens → Custom token → **Account · Stream · Edit** |
   | `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | доорх скриптээс |
   | `CLOUDFLARE_STREAM_SIGNING_KEY_JWK` | доорх скриптээс |

3. Signed URL-ийн түлхүүр үүсгэх:

   ```bash
   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_STREAM_API_TOKEN=... \
     node scripts/cloudflare-stream-signing-key.mjs
   ```

   Түлхүүргүй ч ажиллана (токен бүрийг Cloudflare API-аар үүсгэнэ) гэхдээ
   жагсаалт удаан, thumbnail харагдахгүй.

## Хуулах урсгал

Видео **сервер дамждаггүй**: Vercel хүсэлтийн биеийг ~4.5MB-аар хязгаарладаг
тул хичээлийн видео тэнд багтахгүй.

1. Админ формоо бөглөнө → `POST /api/admin/video-lessons` нь Cloudflare-аас
   нэг удаагийн `uploadURL` авч, хичээлийг `cf_status='uploading'` төлөвтэй
   үүсгэнэ.
2. Хөтөч файлыг тэр URL руу шууд POST хийнэ (явц хувиар харагдана).
3. Cloudflare хөрвүүлж дуусмагц админ жагсаалт 15 секунд тутам шинэчлэгдэж
   `ready` төлөв, үргэлжлэх хугацаа, thumbnail-аа авна.
4. Төлөв `ready` болсны дараа л **Нийтлэх** товч идэвхжинэ — хагас бэлэн
   видеог нийтлэхийг API мөн татгалзана.

## Эрх

| Эрх | Хэн | Юу |
| --- | --- | --- |
| `videos.view` | admin, moderator, sales | Каталог харах, урьдчилан үзэх |
| `videos.manage` | admin | Нэмэх, засах, видео солих, устгах |

Хичээл бүр `access_level`-тэй: `members` (зөвхөн идэвхтэй гишүүнчлэлтэй) эсвэл
`public` (нэвтэрсэн бүх хэрэглэгч). Гишүүнчлэлийн шалгалт нь ирц бүртгэлтэй
ижил дүрэм — `membership_status='active'` бөгөөд дуусах огноо Улаанбаатарын
өнөөдрөөс өмнө биш.

## Апп талын API

Бүгд `Authorization: Bearer <supabase access_token>` шаардана.

### `GET /api/videos`

Query: `category`, `q`, `limit` (≤100), `offset`.

```jsonc
{
  "lessons": [{
    "id": "uuid", "title": "...", "description": "...",
    "category": "yoga", "level": "beginner", "trainer_name": "...",
    "duration_seconds": 1820, "view_count": 42,
    "access_level": "members",
    "locked": false,             // гишүүнчлэл дууссан бол true
    "thumbnail_url": "https://customer-....cloudflarestream.com/<token>/thumbnails/thumbnail.jpg"
  }],
  "total": 12,
  "membership_active": true
}
```

### `GET /api/videos/:id`

`locked` хичээлд `403` + `membership_required: true` буцаана. Амжилттай үед:

```jsonc
{
  "lesson": { "id": "...", "title": "...", "duration_seconds": 1820 },
  "playback": {
    "hls": "https://customer-....cloudflarestream.com/<token>/manifest/video.m3u8",
    "dash": ".../manifest/video.mpd",
    "iframe": ".../iframe",
    "thumbnail": ".../thumbnails/thumbnail.jpg?time=3s&height=360",
    "expiresAt": "2026-09-21T12:00:00.000Z"
  }
}
```

Токен 4 цагийн дараа дуусдаг тул урт хичээлийн дунд шинэчлэх шаардлагагүй ч,
жагсаалтаас буцаж ороход дахин дуудна. Үзэлтийн тоолуур энэ дуудлага дээр
нэмэгдэнэ.

## Өгөгдлийн сан

`public.video_lessons` — мета мэдээлэл (`cf_uid`, `cf_status`, `cf_hls_url`,
`duration_seconds`, `is_published`, `access_level`, `sort_order`, `view_count`).
RLS: нийтлэгдсэн мөрийг л уншина, бичих нь зөвхөн service role (API route).
