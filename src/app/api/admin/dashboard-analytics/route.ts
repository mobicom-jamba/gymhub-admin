import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type MonthPoint = { month: string; count: number };

type PaidRow = {
  payment_status?: string | null;
  payment_channel?: string | null;
  qpay_invoice_id?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

const PAID_STATUS = ["paid", "PAID", "Paid"] as const;

/** True when `bookings` has all columns used for payment dashboard aggregates. */
async function bookingsHasPaymentAnalyticsColumns(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase
    .from("bookings")
    .select("payment_status, payment_channel, qpay_invoice_id, paid_at, created_at")
    .limit(1);
  if (!error) return true;
  const msg = (error.message ?? "").toLowerCase();
  if (/column .* does not exist/i.test(msg)) return false;
  if (msg.includes("unknown column")) return false;
  if (/relation .* does not exist/i.test(msg)) return false;
  return true;
}

type LendingAggRow = {
  channel?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

function isLendingPaidStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "paid" ||
    s === "completed" ||
    s === "success" ||
    s === "succeeded" ||
    s === "settled" ||
    s === "approved" ||
    s === "done"
  );
}

function classifyLendingChannel(channel: string): "qpay" | "sono" | "pocket" | "gift" | "other" {
  const raw = channel.trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "gift") return "gift";
  return "other";
}

/**
 * Fallback when `bookings` has no payment columns (e.g. class-schedule bookings only).
 * Uses `lending_records` if present (Sono flow inserts there).
 */
async function aggregateFromLendingRecords(supabase: SupabaseClient): Promise<{
  channels: { qpay: number; sono: number; pocket: number; gift: number; other: number };
  byMonth: MonthPoint[];
} | null> {
  let selectCols = "channel, status, paid_at, created_at";
  let probe = await supabase.from("lending_records").select(selectCols).limit(1);
  if (probe.error?.message?.includes("paid_at")) {
    selectCols = "channel, status, created_at";
    probe = await supabase.from("lending_records").select(selectCols).limit(1);
  }
  if (probe.error) return null;

  const counts = { qpay: 0, sono: 0, pocket: 0, gift: 0, other: 0 };
  const monthMap: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("lending_records")
      .select(selectCols)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as LendingAggRow[];
    for (const row of rows) {
      if (!isLendingPaidStatus(String(row.status ?? ""))) continue;
      const bucket = classifyLendingChannel(String(row.channel ?? ""));
      counts[bucket]++;
      const raw = row.paid_at || row.created_at;
      if (raw) {
        const month = raw.slice(0, 7);
        monthMap[month] = (monthMap[month] ?? 0) + 1;
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return {
    channels: counts,
    byMonth: Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
  };
}

function emptyPaymentChannels() {
  return { qpay: 0, sono: 0, pocket: 0, gift: 0, other: 0 };
}

function isPaidRow(row: PaidRow): boolean {
  const s = String(row.payment_status ?? "").trim().toLowerCase();
  return s === "paid";
}

/** Sono stores its invoice id in `qpay_invoice_id`; ids start with `GH` (see sono/route). */
function classifyPaymentChannel(row: Pick<PaidRow, "payment_channel" | "qpay_invoice_id">): "qpay" | "sono" | "pocket" | "gift" | "other" {
  const raw = (row.payment_channel ?? "").trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "gift") return "gift";

  const inv = String(row.qpay_invoice_id ?? "").trim();
  if (inv.startsWith("GH")) return "sono";
  if (inv.length > 0) return "qpay";
  return "other";
}

async function createAnalyticsSupabase(): Promise<
  | { client: SupabaseClient; error: null }
  | { client: null; error: "UNAUTHORIZED" | "FORBIDDEN" }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey) {
    return {
      client: createClient(url, serviceKey, { auth: { persistSession: false } }),
      error: null,
    };
  }

  const sb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { client: null, error: "UNAUTHORIZED" };
  }
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((prof as { role?: string } | null)?.role !== "admin") {
    return { client: null, error: "FORBIDDEN" };
  }
  return { client: sb, error: null };
}

async function fetchPaidBookingsPage(
  supabase: SupabaseClient,
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

function aggregatePaymentChannels(supabase: SupabaseClient) {
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
  supabase: SupabaseClient,
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

/** GET — aggregated dashboard chart + payment channel data (service role, or signed-in admin session). */
export async function GET() {
  try {
    const gate = await createAnalyticsSupabase();
    if (gate.error === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Нэвтэрсэн хэрэглэгч олдсонгүй. Dashboard статистик ачаалахын тулд нэвтэрнэ үү." },
        { status: 401 },
      );
    }
    if (gate.error === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Зөвхөн админ эрхтэй хэрэглэгч dashboard статистик харна." },
        { status: 403 },
      );
    }

    const supabase = gate.client;
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client үүсгэж чадсангүй." },
        { status: 500 },
      );
    }
    const nowIso = new Date().toISOString();
    const PAGE = 1000;

    const [usersByMonth, useBookingsPayments] = await Promise.all([
      paginateMembershipStarts(supabase, nowIso, PAGE),
      bookingsHasPaymentAnalyticsColumns(supabase),
    ]);

    let paymentsByMonth: MonthPoint[];
    let channelCounts: ReturnType<typeof emptyPaymentChannels>;
    let paymentsMonthsSource: "bookings" | "lending" | "membership_starts";

    if (useBookingsPayments) {
      [paymentsByMonth, channelCounts] = await Promise.all([
        paginatePaidBookingsByMonth(supabase, PAGE),
        aggregatePaymentChannels(supabase),
      ]);
      paymentsMonthsSource = "bookings";
    } else {
      const lending = await aggregateFromLendingRecords(supabase);
      if (lending) {
        paymentsByMonth = lending.byMonth;
        channelCounts = lending.channels;
        paymentsMonthsSource = "lending";
      } else {
        paymentsByMonth = [];
        channelCounts = emptyPaymentChannels();
        paymentsMonthsSource = "bookings";
      }
    }

    /** Захиалгын төлбөрийн багц (bookings/lending) сарын мөр байхгүй бол гишүүнчлэл эхэлсэн сараар илэрхийлнэ. */
    if (paymentsByMonth.length === 0 && usersByMonth.length > 0) {
      paymentsByMonth = usersByMonth.map((x) => ({ month: x.month, count: x.count }));
      paymentsMonthsSource = "membership_starts";
    }

    return NextResponse.json({
      usersByMonth,
      paymentsByMonth,
      paymentsMonthsSource,
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
  supabase: SupabaseClient,
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
