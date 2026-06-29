import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

/** Per-user gym-visit stats, as returned by the `admin_user_visit_stats` RPC. */
export type UserVisitStats = {
  total: number;
  thisMonth: number;
  thisWeek: number;
  lastVisitAt: string | null;
  lastGymName: string | null;
  streakDays: number;
};

export type UserVisitStatsMap = Record<string, UserVisitStats>;

export const EMPTY_VISIT_STATS: UserVisitStats = {
  total: 0,
  thisMonth: 0,
  thisWeek: 0,
  lastVisitAt: null,
  lastGymName: null,
  streakDays: 0,
};

type RpcRow = {
  user_id: string;
  total: number | null;
  this_month: number | null;
  this_week: number | null;
  last_visit_at: string | null;
  last_gym_name: string | null;
  streak_days: number | null;
};

const CHUNK = 1000;

/**
 * Fetch visit stats for the given user ids via the admin RPC. Users without any
 * (non-rejected) check-ins are simply absent from the result — callers should
 * fall back to {@link EMPTY_VISIT_STATS}. Returns a partial map plus an optional
 * error (the RPC may not exist yet on older databases).
 */
export async function fetchUserVisitStats(
  userIds: string[],
): Promise<{ stats: UserVisitStatsMap; error: string | null }> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return { stats: {}, error: null };

  const supabase = createBrowserSupabaseClient();
  const stats: UserVisitStatsMap = {};
  let error: string | null = null;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error: err } = await supabase.rpc("admin_user_visit_stats", {
      p_user_ids: chunk,
    });
    if (err) {
      error = err.message;
      break;
    }
    for (const row of (data ?? []) as RpcRow[]) {
      stats[row.user_id] = {
        total: row.total ?? 0,
        thisMonth: row.this_month ?? 0,
        thisWeek: row.this_week ?? 0,
        lastVisitAt: row.last_visit_at,
        lastGymName: row.last_gym_name,
        streakDays: row.streak_days ?? 0,
      };
    }
  }

  return { stats, error };
}
