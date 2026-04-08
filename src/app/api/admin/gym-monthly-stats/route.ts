import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyGymStaffOrAdmin } from "@/lib/verify-gym-access";

type VisitRow = { checked_in_at: string };

function monthKeyUlaanbaatar(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value ?? "0";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

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

    const pageSize = 1000;
    let from = 0;
    const counts = new Map<string, number>();

    for (;;) {
      const { data, error } = await supabase
        .from("gym_visits")
        .select("checked_in_at")
        .eq("gym_id", gymId)
        .neq("status", "rejected")
        .gte("checked_in_at", cutoff)
        .order("checked_in_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as VisitRow[];
      for (const r of batch) {
        if (!r.checked_in_at) continue;
        const key = monthKeyUlaanbaatar(r.checked_in_at);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    const months = [...counts.entries()]
      .map(([month, total]) => ({ month, label: monthLabelMn(month), total }))
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
