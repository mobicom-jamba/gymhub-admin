import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PLAYBACK_TTL_SECONDS,
  getVideo,
  playbackUrls,
  signPlaybackToken,
  type PlaybackUrls,
} from "@/lib/cloudflare-stream";
import type { VideoLessonAccess, VideoLessonLevel, VideoLessonStatus } from "@/lib/video-lessons";

export type VideoLessonRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  level: VideoLessonLevel;
  trainer_name: string | null;
  cf_uid: string | null;
  cf_status: VideoLessonStatus;
  cf_error: string | null;
  duration_seconds: number | null;
  cf_hls_url: string | null;
  is_published: boolean;
  access_level: VideoLessonAccess;
  sort_order: number;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export const VIDEO_LESSON_COLUMNS =
  "id, title, description, category, level, trainer_name, cf_uid, cf_status, cf_error, " +
  "duration_seconds, cf_hls_url, is_published, access_level, sort_order, view_count, created_at, updated_at";

/** Улаанбаатарын календарийн өдөр (YYYY-MM-DD). */
function ubDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(d);
}

/**
 * Гишүүнчлэл идэвхтэй эсэх — ирц бүртгэлтэй ижил дүрэм: төлөв нь `active`
 * бөгөөд дуусах огноо нь Улаанбаатарын өнөөдрөөс өмнө биш байх.
 */
export async function hasActiveMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("membership_status, membership_expires_at")
    .eq("id", userId)
    .maybeSingle();

  const row = data as { membership_status?: string | null; membership_expires_at?: string | null } | null;
  if (String(row?.membership_status ?? "").trim().toLowerCase() !== "active") return false;
  if (!row?.membership_expires_at) return true;
  return ubDate(new Date(row.membership_expires_at)) >= ubDate(new Date());
}

/**
 * Cloudflare дээрх боловсруулалт дуусаагүй мөрүүдийг шинэчилнэ. Stream нь
 * хуулж дуусахаас өмнө үргэлжлэх хугацаа, playback хаягаа өгдөггүй тул
 * "бэлэн" болсныг ийнхүү гүйцээж бичнэ. Нэг хүсэлтэд цөөхөн мөр л шалгана.
 */
export async function syncPendingLessons(
  supabase: SupabaseClient,
  rows: VideoLessonRow[],
  limit = 8,
): Promise<VideoLessonRow[]> {
  const pending = rows
    .filter((r) => r.cf_uid && r.cf_status !== "ready" && r.cf_status !== "error")
    .slice(0, limit);
  if (pending.length === 0) return rows;

  const updates = await Promise.all(
    pending.map(async (row) => {
      try {
        const video = await getVideo(row.cf_uid as string);
        const patch = {
          cf_status: video.state,
          cf_error: video.errorText,
          duration_seconds: video.durationSeconds ?? row.duration_seconds,
          cf_hls_url: video.hlsUrl ?? row.cf_hls_url,
        };
        if (
          patch.cf_status === row.cf_status &&
          patch.duration_seconds === row.duration_seconds &&
          patch.cf_hls_url === row.cf_hls_url
        ) {
          return null;
        }
        await supabase.from("video_lessons").update(patch).eq("id", row.id);
        return { id: row.id, patch };
      } catch {
        // Cloudflare түр хариугүй байвал хуучин төлвөө хадгална.
        return null;
      }
    }),
  );

  const patchById = new Map(updates.filter(Boolean).map((u) => [u!.id, u!.patch]));
  return rows.map((r) => (patchById.has(r.id) ? { ...r, ...patchById.get(r.id)! } : r));
}

/** Бэлэн видеоны signed хаягууд. Бэлэн биш бол null. */
export async function signLesson(
  row: VideoLessonRow,
  ttlSeconds: number = DEFAULT_PLAYBACK_TTL_SECONDS,
): Promise<PlaybackUrls | null> {
  if (!row.cf_uid || row.cf_status !== "ready") return null;
  try {
    const token = await signPlaybackToken(row.cf_uid, ttlSeconds);
    return playbackUrls({ hlsUrl: row.cf_hls_url, uid: row.cf_uid, token, ttlSeconds });
  } catch {
    return null;
  }
}

