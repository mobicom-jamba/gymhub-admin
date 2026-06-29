import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

/** Header stats for the Visits "Бүх ирц" tab (non-rejected check-ins). */
export type VisitsOverviewStats = {
  total: number;
  thisMonth: number;
  today: number;
};

/** One visit row enriched with the member's profile + per-user aggregates. */
export type OverviewVisit = {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string | null;
  method: string;
  checked_in_at: string;
  fullName: string | null;
  phone: string | null;
  avatarPath: string | null;
  membershipStatus: string | null;
  membershipExpiresAt: string | null;
  userTotal: number;
  userLastVisitAt: string | null;
};

type RpcStats = {
  total: number | null;
  this_month: number | null;
  today: number | null;
};

type RpcVisit = {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string | null;
  method: string;
  checked_in_at: string;
  full_name: string | null;
  phone: string | null;
  avatar_path: string | null;
  membership_status: string | null;
  membership_expires_at: string | null;
  user_total: number | null;
  user_last_visit_at: string | null;
};

type RpcPayload = {
  stats: RpcStats | null;
  visits: RpcVisit[] | null;
};

/**
 * Fetch the Visits overview in a single RPC round-trip: header stats plus the
 * most-recent visits enriched with profile + per-user totals (admin RPC).
 */
export async function fetchVisitsOverview(): Promise<{
  stats: VisitsOverviewStats;
  visits: OverviewVisit[];
  error: string | null;
}> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("admin_visits_overview");
  if (error) {
    return { stats: { total: 0, thisMonth: 0, today: 0 }, visits: [], error: error.message };
  }

  const payload = (data ?? {}) as RpcPayload;
  const stats: VisitsOverviewStats = {
    total: payload.stats?.total ?? 0,
    thisMonth: payload.stats?.this_month ?? 0,
    today: payload.stats?.today ?? 0,
  };
  const visits: OverviewVisit[] = (payload.visits ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    gym_id: r.gym_id,
    gym_name: r.gym_name,
    method: r.method,
    checked_in_at: r.checked_in_at,
    fullName: r.full_name,
    phone: r.phone,
    avatarPath: r.avatar_path,
    membershipStatus: r.membership_status,
    membershipExpiresAt: r.membership_expires_at,
    userTotal: r.user_total ?? 0,
    userLastVisitAt: r.user_last_visit_at,
  }));

  return { stats, visits, error: null };
}
