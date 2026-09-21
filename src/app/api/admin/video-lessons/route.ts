import { NextResponse } from "next/server";
import {
  CloudflareStreamError,
  canSignLocally,
  createDirectUpload,
  isCloudflareStreamConfigured,
} from "@/lib/cloudflare-stream";
import { createAdminClient } from "@/lib/supabase";
import {
  VIDEO_LESSON_COLUMNS,
  signLesson,
  syncPendingLessons,
  type VideoLessonRow,
} from "@/lib/video-lesson-access";
import { requirePermission } from "@/lib/verify-gym-access";
import { normalizeLessonPayload, type LessonPayload } from "@/lib/video-lesson-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function streamErrorResponse(err: unknown) {
  if (err instanceof CloudflareStreamError) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Тодорхойгүй алдаа" },
    { status: 500 },
  );
}

/** GET /api/admin/video-lessons — бүх хичээл (ноорог, нийтлэгдээгүйг оруулаад). */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission(request, "videos.view", "Видео хичээл харах эрхгүй.");
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const category = url.searchParams.get("category")?.trim() || "";
    const query = url.searchParams.get("q")?.trim() || "";

    const supabase = createAdminClient();
    let select = supabase
      .from("video_lessons")
      .select(VIDEO_LESSON_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    if (category) select = select.eq("category", category);
    if (query) select = select.or(`title.ilike.%${query}%,trainer_name.ilike.%${query}%`);

    const { data, error } = await select;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Cloudflare дээр хөрвүүлэлт дуусмагц төлөв/хугацааг гүйцээж бичнэ.
    const rows = await syncPendingLessons(supabase, (data ?? []) as unknown as VideoLessonRow[]);

    // Зурган хавтас нь бас signed — гарын үсгийн түлхүүр локал байвал л
    // жагсаалт бүрт үүсгэнэ (эс тэгвээс видео бүрт нэг API дуудлага болно).
    const withThumbs = canSignLocally()
      ? await Promise.all(
          rows.map(async (row) => ({
            ...row,
            thumbnail_url: (await signLesson(row, 60 * 60))?.thumbnail ?? null,
          })),
        )
      : rows.map((row) => ({ ...row, thumbnail_url: null }));

    return NextResponse.json({
      lessons: withThumbs,
      cloudflare_configured: isCloudflareStreamConfigured(),
    });
  } catch (err) {
    return streamErrorResponse(err);
  }
}

/**
 * POST /api/admin/video-lessons — хичээл үүсгээд, видеог нь Cloudflare руу
 * шууд хуулах нэг удаагийн URL-ыг буцаана.
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission(request, "videos.manage", "Видео хичээл нэмэх эрхгүй.");
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as LessonPayload;
    const values = normalizeLessonPayload(body);
    if (!values.title) {
      return NextResponse.json({ error: "Хичээлийн нэр оруулна уу." }, { status: 400 });
    }

    const upload = await createDirectUpload({ name: values.title, creator: auth.userId });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("video_lessons")
      .insert({
        ...values,
        cf_uid: upload.uid,
        cf_status: "uploading",
        created_by: auth.userId,
      })
      .select(VIDEO_LESSON_COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ lesson: data, upload_url: upload.uploadUrl });
  } catch (err) {
    return streamErrorResponse(err);
  }
}
