/** Видео хичээлийн ерөнхий төрөл, шошго — сервер, хөтөч хоёулаа ашиглана. */

export type VideoLessonLevel = "all" | "beginner" | "intermediate" | "advanced";
export type VideoLessonStatus = "pending" | "uploading" | "processing" | "ready" | "error";
export type VideoLessonAccess = "members" | "public";

export const VIDEO_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "fitness", label: "Фитнес" },
  { id: "yoga", label: "Йога" },
  { id: "pool", label: "Усан сэлэлт" },
  { id: "nutrition", label: "Хоол тэжээл" },
  { id: "other", label: "Бусад" },
];

export const VIDEO_LEVELS: ReadonlyArray<{ id: VideoLessonLevel; label: string }> = [
  { id: "all", label: "Бүх түвшин" },
  { id: "beginner", label: "Анхан" },
  { id: "intermediate", label: "Дунд" },
  { id: "advanced", label: "Ахисан" },
];

export function categoryLabel(id: string): string {
  return VIDEO_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function levelLabel(id: string): string {
  return VIDEO_LEVELS.find((l) => l.id === id)?.label ?? id;
}

export function statusLabel(status: VideoLessonStatus): string {
  switch (status) {
    case "ready":
      return "Бэлэн";
    case "processing":
      return "Боловсруулж байна";
    case "uploading":
      return "Хуулж байна";
    case "error":
      return "Алдаатай";
    default:
      return "Хүлээгдэж буй";
  }
}

/** 3725 → "1:02:05", 185 → "3:05" */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
