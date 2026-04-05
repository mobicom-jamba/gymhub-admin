import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type MonthPoint = { month: string; count: number };

/** GET — aggregated dashboard chart + payment channel data (service role; bypasses RLS). */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const PAGE = 1000;

    const usersByMonth = await paginateMembershipStarts(supabase, nowIso, PAGE);
    const paymentsByMonth = await paginatePaidBookingsByMonth(supabase, PAGE);

    const [qpayRes, sonoRes, pocketRes, giftRes] = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "qpay"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "sono"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "pocket"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "gift"),
    ]);

    return NextResponse.json({
      usersByMonth,
      paymentsByMonth,
      paymentChannels: {
        qpay: qpayRes.count ?? 0,
        sono: sonoRes.count ?? 0,
        pocket: pocketRes.count ?? 0,
        gift: giftRes.count ?? 0,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function paginateMembershipStarts(
  supabase: ReturnType<typeof createAdminClient>,
  capIso: string,
  pageSize: number,
): Promise<MonthPoint[]> {
  const monthMap: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("membership_started_at")
      .not("membership_started_at", "is", null)
      .lte("membership_started_at", capIso)
      .order("membership_started_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const month = row.membership_started_at?.slice(0, 7);
      if (month) monthMap[month] = (monthMap[month] ?? 0) + 1;
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

async function paginatePaidBookingsByMonth(
  supabase: ReturnType<typeof createAdminClient>,
  pageSize: number,
): Promise<MonthPoint[]> {
  const monthMap: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("bookings")
      .select("paid_at, created_at")
      .eq("payment_status", "paid")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const raw = (row as { paid_at?: string | null; created_at?: string | null }).paid_at
        || (row as { paid_at?: string | null; created_at?: string | null }).created_at;
      if (!raw) continue;
      const month = raw.slice(0, 7);
      monthMap[month] = (monthMap[month] ?? 0) + 1;
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}
