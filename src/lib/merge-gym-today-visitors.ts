import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayStartUTC8 } from "@/lib/gym-daily-capacity";

type GymRow = { id: string };

/** Adds `today_visitors` to each gym (pending+approved check-ins since local midnight UTC+8). */
export async function mergeTodayVisitorCounts<T extends GymRow>(
  supabase: SupabaseClient,
  gyms: T[]
): Promise<Array<T & { today_visitors: number }>> {
  if (gyms.length === 0) return [];

  const todayStart = getTodayStartUTC8();
  const ids = gyms.map((g) => g.id);

  const { data: rows, error } = await supabase
    .from("gym_visits")
    .select("gym_id")
    .gte("checked_in_at", todayStart)
    .in("status", ["pending", "approved"])
    .in("gym_id", ids);

  if (error) throw new Error(error.message);

  const byGym = new Map<string, number>();
  for (const row of rows ?? []) {
    const gid = row.gym_id as string;
    byGym.set(gid, (byGym.get(gid) ?? 0) + 1);
  }

  return gyms.map((g) => ({
    ...g,
    today_visitors: byGym.get(g.id) ?? 0,
  }));
}
