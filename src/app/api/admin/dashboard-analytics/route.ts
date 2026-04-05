import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type MonthPoint = { month: string; count: number };

type PaidRow = {
  payment_status?: string | null;
  payment_channel?: string | null;
  qpay_invoice_id?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

const PAID_STATUS = ["paid", "PAID", "Paid"] as const;

function isPaidRow(row: PaidRow): boolean {
  const s = String(row.payment_status ?? "").trim().toLowerCase();
  return s === "paid";
}

/** Sono stores its invoice id in `qpay_invoice_id`; ids start with `GH` (see sono/route). */
function classifyPaymentChannel(row: Pick<PaidRow, "payment_channel" | "qpay_invoice_id">): "qpay" | "sono" | "pocket" | "gift" | "other" {
  const raw = (row.payment_channel ?? "").trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "gift") return "gift";

  const inv = String(row.qpay_invoice_id ?? "").trim();
  if (inv.startsWith("GH")) return "sono";
  if (inv.length > 0) return "qpay";
  return "other";
}

async function fetchPaidBookingsPage(
  supabase: ReturnType<typeof createAdminClient>,
  from: number,
  pageSize: number,
  select: string,
): Promise<{ data: PaidRow[] | null; error: { message: string } | null }> {
  let res = await supabase
    .from("bookings")
    .select(select)
    .in("payment_status", [...PAID_STATUS])
    .order("created_at", { ascending: true })
    .range(from, from + pageSize - 1);

  if (res.error) {
    res = await supabase
      .from("bookings")
      .select(select)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
  }
  return { data: res.data as PaidRow[] | null, error: res.error };
}

function aggregatePaymentChannels(supabase: ReturnType<typeof createAdminClient>) {
  const counts = { qpay: 0, sono: 0, pocket: 0, gift: 0, other: 0 };
  const PAGE = 1000;
  let from = 0;

  return (async () => {
    for (;;) {
      const { data, error } = await fetchPaidBookingsPage(
        supabase,
        from,
        PAGE,
        "payment_status, payment_channel, qpay_invoice_id",
      );
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      for (const row of rows) {
        if (!isPaidRow(row)) continue;
        const bucket = classifyPaymentChannel(row);
        counts[bucket]++;
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return counts;
  })();
}

async function paginatePaidBookingsByMonth(
  supabase: ReturnType<typeof createAdminClient>,
  pageSize: number,
): Promise<MonthPoint[]> {
  const monthMap: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPaidBookingsPage(
      supabase,
      from,
      pageSize,
      "payment_status, paid_at, created_at",
    );
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (!isPaidRow(row)) continue;
      const raw = row.paid_at || row.created_at;
      if (!raw) continue;
      const month = raw.slice(0, 7);
      monthMap[month] = (monthMap[month] ?? 0) + 1;
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

/** GET — aggregated dashboard chart + payment channel data (service role; bypasses RLS). */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const PAGE = 1000;

    const [usersByMonth, paymentsByMonth, channelCounts] = await Promise.all([
      paginateMembershipStarts(supabase, nowIso, PAGE),
      paginatePaidBookingsByMonth(supabase, PAGE),
      aggregatePaymentChannels(supabase),
    ]);

    return NextResponse.json({
      usersByMonth,
      paymentsByMonth,
      paymentChannels: {
        qpay: channelCounts.qpay,
        sono: channelCounts.sono,
        pocket: channelCounts.pocket,
        gift: channelCounts.gift,
        other: channelCounts.other,
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
