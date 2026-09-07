import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayStartUTC8 } from "@/lib/gym-daily-capacity";

type GymRow = { id: string };

function withZeroCounts<T extends GymRow>(gyms: T[]): Array<T & { today_visitors: number }> {
  return gyms.map((g) => ({ ...g, today_visitors: 0 }));
}

function mapCounts<T extends GymRow>(
  gyms: T[],
  rows: Array<{ gym_id?: string | null; visitor_count?: number | string | null }> | null,
): Array<T & { today_visitors: number }> {
  const byGym = new Map<string, number>();
  for (const row of rows ?? []) {
    const gid = String(row.gym_id ?? "").trim();
    if (!gid) continue;
    byGym.set(gid, Number(row.visitor_count) || 0);
  }
  return gyms.map((g) => ({
    ...g,
    today_visitors: byGym.get(g.id) ?? 0,
  }));
}

/**
 * Adds `today_visitors` to each gym (pending+approved check-ins since local midnight UTC+8).
 * Uses a GROUP BY RPC so we never download every visit row. On failure, returns 0 counts
 * so GET /api/gyms still succeeds.
 */
export async function mergeTodayVisitorCounts<T extends GymRow>(
  supabase: SupabaseClient,
  gyms: T[]
): Promise<Array<T & { today_visitors: number }>> {
  if (gyms.length === 0) return [];

  const todayStart = getTodayStartUTC8();

  try {
    const { data, error } = await supabase.rpc("gym_today_visitor_counts", {
      p_today_start: todayStart,
    });

    if (!error) {
      return mapCounts(gyms, data as Array<{ gym_id?: string; visitor_count?: number }>);
    }

    console.warn("[today_visitors] rpc:", error.message);
  } catch (e) {
    console.warn("[today_visitors] rpc:", e);
  }

  return withZeroCounts(gyms);
}
