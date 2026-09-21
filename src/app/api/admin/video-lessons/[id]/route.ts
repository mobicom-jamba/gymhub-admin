import { NextResponse } from "next/server";
import { CloudflareStreamError, deleteVideo } from "@/lib/cloudflare-stream";
import { createAdminClient } from "@/lib/supabase";
import { VIDEO_LESSON_COLUMNS, signLesson, type VideoLessonRow } from "@/lib/video-lesson-access";
import { requirePermission } from "@/lib/verify-gym-access";
import { normalizeLessonPayload, type LessonPayload } from "@/lib/video-lesson-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — нэг хичээл + админы урьдчилан үзэх signed хаягууд. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "videos.view", "Видео хичээл харах эрхгүй.");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("video_lessons")
    .select(VIDEO_LESSON_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Хичээл олдсонгүй." }, { status: 404 });

  const row = data as unknown as VideoLessonRow;
  return NextResponse.json({ lesson: row, playback: await signLesson(row, 60 * 60) });
}

/** PATCH — мета мэдээлэл засах, нийтлэх/нуух. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "videos.manage", "Видео хичээл засах эрхгүй.");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as LessonPayload;
  const values = normalizeLessonPayload(body);
  if (!values.title) {
    return NextResponse.json({ error: "Хичээлийн нэр оруулна уу." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("video_lessons")
    .select("cf_status")
    .eq("id", id)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: "Хичээл олдсонгүй." }, { status: 404 });

  // Видео нь бэлэн болоогүй байхад нийтлэвэл хэрэглэгчид хоосон плеер харна.
  if (values.is_published && (current as { cf_status: string }).cf_status !== "ready") {
    return NextResponse.json(
      { error: "Видео боловсруулагдаж дуусаагүй тул одоогоор нийтлэх боломжгүй." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("video_lessons")
    .update(values)
    .eq("id", id)
    .select(VIDEO_LESSON_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}

/** DELETE — Cloudflare дээрх видеог нь хамт устгана. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "videos.manage", "Видео хичээл устгах эрхгүй.");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("video_lessons")
    .select("cf_uid")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Хичээл олдсонгүй." }, { status: 404 });

  const uid = (row as { cf_uid: string | null }).cf_uid;
  if (uid) {
    try {
      await deleteVideo(uid);
    } catch (err) {
      // Cloudflare дээр үлдэх нь DB-д өнчин мөр үлдээхээс дээр — админд хэлнэ.
      const message = err instanceof CloudflareStreamError ? err.message : "Cloudflare алдаа";
      return NextResponse.json({ error: `Видеог Cloudflare-оос устгаж чадсангүй: ${message}` }, { status: 502 });
    }
  }

  const { error } = await supabase.from("video_lessons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
