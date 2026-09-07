import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/gym-visit-counts?since=<ISO>
 * Returns visit counts per gym_id since the given timestamp.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    const canView =
      auth.isAdmin ||
      hasPermission(auth.permissions, "gyms.view") ||
      hasPermission(auth.permissions, "fitness.activity.view");
    if (!canView) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");
    if (!since) {
      return NextResponse.json({ error: "since шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("gym_visit_counts_since", {
      p_since: since,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const gid = String((row as { gym_id?: string }).gym_id ?? "").trim();
      if (!gid) continue;
      counts[gid] = Number((row as { visitor_count?: number }).visitor_count) || 0;
    }

    return NextResponse.json({ counts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
