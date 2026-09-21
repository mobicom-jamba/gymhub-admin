import { VIDEO_CATEGORIES, type VideoLessonLevel } from "@/lib/video-lessons";

const LEVELS: VideoLessonLevel[] = ["all", "beginner", "intermediate", "advanced"];

export type LessonPayload = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  level?: unknown;
  trainer_name?: unknown;
  access_level?: unknown;
  sort_order?: unknown;
  is_published?: unknown;
};

/** Формын утгыг цэвэрлэж, DB-д бичих хэлбэрт оруулна. */
export function normalizeLessonPayload(body: LessonPayload) {
  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "fitness").trim();
  const level = String(body.level ?? "all").trim() as VideoLessonLevel;
  const access = String(body.access_level ?? "members").trim();
  const sortOrder = Number(body.sort_order ?? 0);

  return {
    title,
    description: String(body.description ?? "").trim() || null,
    category: VIDEO_CATEGORIES.some((c) => c.id === category) ? category : "other",
    level: (LEVELS.includes(level) ? level : "all") as VideoLessonLevel,
    trainer_name: String(body.trainer_name ?? "").trim() || null,
    access_level: (access === "public" ? "public" : "members") as "public" | "members",
    sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
    is_published: Boolean(body.is_published),
  };
}
