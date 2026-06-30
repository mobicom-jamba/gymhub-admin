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

    // 13 сарын хугацааны өгөгдөл (UTC+8 бүсийн эхний өдрөөс)
    const now = new Date();
    const cutoffUtc8 = new Date(now.getTime() + 8 * 3600 * 1000);
    cutoffUtc8.setUTCMonth(cutoffUtc8.getUTCMonth() - 12);
    cutoffUtc8.setUTCDate(1);
    cutoffUtc8.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(cutoffUtc8.getTime() - 8 * 3600 * 1000).toISOString();

    const supabase = createAdminClient();
    const monthMap = new Map<string, number>();
    const PAGE = 1000;
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("gym_visits")
        .select("checked_in_at")
        .eq("gym_id", gymId)
        .neq("status", "rejected")
        .gte("checked_in_at", cutoff)
        .range(from, from + PAGE - 1);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      for (const row of data ?? []) {
        const ts = (row as { checked_in_at?: string | null }).checked_in_at;
        if (!ts) continue;
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) continue;
        // Монгол цаг UTC+8
        const mnMs = d.getTime() + 8 * 3600 * 1000;
        const mnD = new Date(mnMs);
        const key = `${mnD.getUTCFullYear()}-${String(mnD.getUTCMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }

      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    const months = Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, count]) => {
        const [y, m] = month.split("-");
        return { month, label: `${y} оны ${parseInt(m, 10)} сар`, count };
      });

    return NextResponse.json({ months });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
