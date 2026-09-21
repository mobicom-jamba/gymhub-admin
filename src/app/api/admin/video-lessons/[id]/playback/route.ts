import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  VIDEO_LESSON_COLUMNS,
  signLesson,
  syncPendingLessons,
  type VideoLessonRow,
} from "@/lib/video-lesson-access";
import { requirePermission } from "@/lib/verify-gym-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — админы урьдчилан үзэх богино хугацааны signed хаяг (1 цаг). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "videos.view", "Видео үзэх эрхгүй.");
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

  // Дөнгөж хуулсан видеог нээх үед төлөв нь хоцорсон байж болно.
  const [row] = await syncPendingLessons(supabase, [data as unknown as VideoLessonRow]);
  const playback = await signLesson(row, 60 * 60);

  if (!playback) {
    return NextResponse.json(
      { error: "Видео хараахан бэлэн болоогүй байна.", status: row.cf_status },
      { status: 409 },
    );
  }
  return NextResponse.json({ playback, status: row.cf_status });
}
