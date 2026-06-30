import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/gym-visit-counts?since=<ISO>
 * Returns visit counts per gym_id since the given timestamp (admin only).
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");
    if (!since) {
      return NextResponse.json({ error: "since шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const counts: Record<string, number> = {};
    const PAGE = 1000;
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("gym_visits")
        .select("gym_id")
        .neq("status", "rejected")
        .gte("checked_in_at", since)
        .range(from, from + PAGE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const row of data ?? []) {
        if (row.gym_id) counts[row.gym_id] = (counts[row.gym_id] ?? 0) + 1;
      }

      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json({ counts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
