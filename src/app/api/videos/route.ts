import { NextResponse } from "next/server";
import { canSignLocally } from "@/lib/cloudflare-stream";
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
 * GET /api/videos — нийтлэгдсэн видео хичээлүүд (апп/gymhub.mn-д).
 *
 * Гишүүнчлэл дууссан хэрэглэгчид жагсаалт харагдана ч `locked: true` гэж
 * ирнэ — тоглуулах холбоос зөвхөн дэлгэрэнгүй дуудлагад, эрх шалгасны дараа
 * олгогдоно.
 */
export async function GET(request: Request) {
  const auth = await verifyJwtUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const category = url.searchParams.get("category")?.trim() || "";
  const query = url.searchParams.get("q")?.trim() || "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  const supabase = createAdminClient();
  let select = supabase
    .from("video_lessons")
    .select(VIDEO_LESSON_COLUMNS, { count: "exact" })
    .eq("is_published", true)
    .eq("cf_status", "ready")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) select = select.eq("category", category);
  if (query) select = select.or(`title.ilike.%${query}%,trainer_name.ilike.%${query}%`);

  const { data, error, count } = await select;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as VideoLessonRow[];
  const memberActive = rows.some((r) => r.access_level === "members")
    ? await hasActiveMembership(supabase, auth.userId)
    : false;

  const signThumbs = canSignLocally();
  const lessons = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      level: row.level,
      trainer_name: row.trainer_name,
      duration_seconds: row.duration_seconds,
      view_count: row.view_count,
      access_level: row.access_level,
      locked: row.access_level === "members" && !memberActive,
      thumbnail_url: signThumbs ? ((await signLesson(row, 60 * 60))?.thumbnail ?? null) : null,
      created_at: row.created_at,
    })),
  );

  return NextResponse.json({ lessons, total: count ?? lessons.length, membership_active: memberActive });
}
