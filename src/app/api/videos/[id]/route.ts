import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  VIDEO_LESSON_COLUMNS,
  hasActiveMembership,
  signLesson,
  type VideoLessonRow,
} from "@/lib/video-lesson-access";
import { verifyJwtUser } from "@/lib/verify-jwt-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/videos/:id — тоглуулах signed хаягууд.
 * `members` түвшний хичээлийг зөвхөн идэвхтэй гишүүнчлэлтэй хэрэглэгч авна.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyJwtUser(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("video_lessons")
    .select(VIDEO_LESSON_COLUMNS)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Хичээл олдсонгүй." }, { status: 404 });

  const row = data as unknown as VideoLessonRow;

  if (row.access_level === "members" && !(await hasActiveMembership(supabase, auth.userId))) {
    return NextResponse.json(
      {
        error: "Энэ хичээлийг үзэхийн тулд идэвхтэй гишүүнчлэл шаардлагатай.",
        membership_required: true,
      },
      { status: 403 },
    );
  }

  const playback = await signLesson(row);
  if (!playback) {
    return NextResponse.json({ error: "Видео бэлэн болоогүй байна." }, { status: 409 });
  }

  // Тоолуур: алдаа гарлаа ч үзэлтийг зогсоохгүй.
  await supabase.rpc("increment_video_lesson_view", { p_lesson: row.id });

  return NextResponse.json({
    lesson: {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      level: row.level,
      trainer_name: row.trainer_name,
      duration_seconds: row.duration_seconds,
      view_count: row.view_count + 1,
    },
    playback,
  });
}
