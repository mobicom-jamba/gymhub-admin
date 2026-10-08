import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayStartUTC8 } from "@/lib/gym-daily-capacity";
import { isGymComingSoon } from "@/lib/gym-opening";

type GymRow = {
  id: string;
  daily_visitor_limit?: number | null;
  force_full?: boolean | null;
  opens_at?: string | null;
};

type WithCounts<T> = T & { today_visitors: number; is_full: boolean; is_coming_soon: boolean };

/** Shown capacity when a gym is switched to full but has no daily_visitor_limit. */
const FORCED_FULL_DEFAULT_LIMIT = 25;

/** Admin "Дүүрсэн" switch reports the gym as full: visitors = limit (e.g. 25/25). */
function withFullness<T extends GymRow>(g: T, counted: number): WithCounts<T> {
  // Гэрээ хийгдэж буй (opens_at ирээдүйд) фитнес: апп тоолуур харуулна, дүүрэлт хамаагүй.
  if (isGymComingSoon(g.opens_at)) {
    return { ...g, today_visitors: 0, is_full: false, is_coming_soon: true };
  }
  const limit = g.daily_visitor_limit != null && g.daily_visitor_limit > 0 ? g.daily_visitor_limit : null;
  if (g.force_full) {
    const shownLimit = limit ?? FORCED_FULL_DEFAULT_LIMIT;
    return {
      ...g,
      daily_visitor_limit: shownLimit,
      today_visitors: Math.max(counted, shownLimit),
      is_full: true,
      is_coming_soon: false,
    };
  }
  return {
    ...g,
    today_visitors: counted,
    is_full: limit != null && counted >= limit,
    is_coming_soon: false,
  };
}

function withZeroCounts<T extends GymRow>(gyms: T[]): Array<WithCounts<T>> {
  return gyms.map((g) => withFullness(g, 0));
}

function mapCounts<T extends GymRow>(
  gyms: T[],
  rows: Array<{ gym_id?: string | null; visitor_count?: number | string | null }> | null,
): Array<WithCounts<T>> {
  const byGym = new Map<string, number>();
  for (const row of rows ?? []) {
    const gid = String(row.gym_id ?? "").trim();
    if (!gid) continue;
    byGym.set(gid, Number(row.visitor_count) || 0);
  }
  return gyms.map((g) => withFullness(g, byGym.get(g.id) ?? 0));
}

/**
 * Adds `today_visitors` (pending+approved check-ins since local midnight UTC+8), `is_full` and
 * `is_coming_soon` (opens_at still in the future) to each gym.
 * Uses a GROUP BY RPC so we never download every visit row. On failure, returns 0 counts
 * so GET /api/gyms still succeeds.
 */
export async function mergeTodayVisitorCounts<T extends GymRow>(
  supabase: SupabaseClient,
  gyms: T[]
): Promise<Array<WithCounts<T>>> {
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
