import type { SupabaseClient } from "@supabase/supabase-js";

/** Mongolia (UTC+8) local midnight as ISO timestamp in UTC */
export function getTodayStartUTC8(): string {
  const now = new Date();
  const mongoliaOffset = 8 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const mongoliaMs = utcMs + mongoliaOffset * 60000;
  const mongoliaDate = new Date(mongoliaMs);
  const startOfDay = new Date(
    mongoliaDate.getFullYear(),
    mongoliaDate.getMonth(),
    mongoliaDate.getDate(),
    0,
    0,
    0,
    0
  );
  const startUtcMs = startOfDay.getTime() - mongoliaOffset * 60000;
  return new Date(startUtcMs).toISOString();
}

/** Counts visits that consume daily capacity (rejected frees a slot). */
export async function countGymVisitorsToday(
  supabase: SupabaseClient,
  gymId: string,
  todayStartIso: string
): Promise<number> {
  const { count, error } = await supabase
    .from("gym_visits")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .gte("checked_in_at", todayStartIso)
    .in("status", ["pending", "approved"]);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function gymHasDailyCapacityLeft(
  limit: number | null | undefined,
  used: number
): boolean {
  if (limit == null || limit <= 0) return true;
  return used < limit;
}
