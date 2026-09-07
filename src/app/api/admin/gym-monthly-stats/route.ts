import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyGymStaffOrAdmin } from "@/lib/verify-gym-access";

function monthLabelMn(key: string): string {
  const [y, mo] = key.split("-");
  const n = Number(mo);
  return `${y} оны ${n} сар`;
}

/**
 * GET /api/admin/gym-monthly-stats?gym_id=uuid
 * Monthly visit counts for a gym (rejected excluded).
 * Limits to last 12 months and filters rejected at DB level.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gym_id");
    if (!gymId) {
      return NextResponse.json({ error: "gym_id шаардлагатай" }, { status: 400 });
    }

    const access = await verifyGymStaffOrAdmin(request, gymId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12);
    twelveMonthsAgo.setUTCDate(1);
    twelveMonthsAgo.setUTCHours(0, 0, 0, 0);
    const cutoff = twelveMonthsAgo.toISOString();

    const { data, error } = await supabase.rpc("gym_visit_counts_by_month", {
      p_gym_id: gymId,
      p_since: cutoff,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const months = ((data ?? []) as { month?: string; visitor_count?: number | string }[])
      .map((row) => {
        const month = String(row.month ?? "").trim();
        return {
          month,
          label: monthLabelMn(month),
          total: Number(row.visitor_count) || 0,
        };
      })
      .filter((r) => /^\d{4}-\d{2}$/.test(r.month))
      .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));

    return NextResponse.json(
      {
        gym_id: gymId,
        months,
        note: "Татгалзсан хүсэлт тоолохгүй. Сар нь Улаанбаатар цагийн бүсээр.",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
