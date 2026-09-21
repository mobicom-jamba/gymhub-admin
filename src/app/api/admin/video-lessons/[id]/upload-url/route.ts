import { NextResponse } from "next/server";
import { CloudflareStreamError, createDirectUpload, deleteVideo } from "@/lib/cloudflare-stream";
import { createAdminClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/verify-gym-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — тухайн хичээлийн видеог солих (эсвэл амжилтгүй болсныг дахин хуулах).
 * Хуучин видеог Cloudflare-оос устгаад шинэ upload URL өгнө.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission(request, "videos.manage", "Видео солих эрхгүй.");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("video_lessons")
      .select("id, title, cf_uid")
      .eq("id", id)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: "Хичээл олдсонгүй." }, { status: 404 });

    const current = row as { title: string; cf_uid: string | null };
    if (current.cf_uid) {
      try {
        await deleteVideo(current.cf_uid);
      } catch {
        // Хуучин видео устахгүй бол ч шинийг хуулахад саад болохгүй.
      }
    }

    const upload = await createDirectUpload({ name: current.title, creator: auth.userId });

    // Шинэ видео бэлэн болтол хичээл нийтлэгдээгүй байна.
    const { error } = await supabase
      .from("video_lessons")
      .update({
        cf_uid: upload.uid,
        cf_status: "uploading",
        cf_error: null,
        cf_hls_url: null,
        duration_seconds: null,
        is_published: false,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ upload_url: upload.uploadUrl, cf_uid: upload.uid });
  } catch (err) {
    const status = err instanceof CloudflareStreamError ? 502 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Тодорхойгүй алдаа" },
      { status },
    );
  }
}
