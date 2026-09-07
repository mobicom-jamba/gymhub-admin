import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/gym-visit-monthly?gym_id=<uuid>
 * Returns monthly visit counts (UTC+8) for a given gym (admin only).
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gym_id")?.trim();
    if (!gymId) {
      return NextResponse.json({ error: "gym_id шаардлагатай." }, { status: 400 });
    }

    const now = new Date();
    const cutoffUtc8 = new Date(now.getTime() + 8 * 3600 * 1000);
    cutoffUtc8.setUTCMonth(cutoffUtc8.getUTCMonth() - 12);
    cutoffUtc8.setUTCDate(1);
    cutoffUtc8.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(cutoffUtc8.getTime() - 8 * 3600 * 1000).toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("gym_visit_counts_by_month", {
      p_gym_id: gymId,
      p_since: cutoff,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const months = ((data ?? []) as { month?: string; visitor_count?: number | string }[])
      .map((row) => {
        const month = String(row.month ?? "").trim();
        const count = Number(row.visitor_count) || 0;
        const [y, m] = month.split("-");
        return {
          month,
          label: `${y} оны ${parseInt(m, 10)} сар`,
          count,
        };
      })
      .filter((r) => /^\d{4}-\d{2}$/.test(r.month))
      .sort((a, b) => b.month.localeCompare(a.month));

    return NextResponse.json(
      { months },
      {
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
