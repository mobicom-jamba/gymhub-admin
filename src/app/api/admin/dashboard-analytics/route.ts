import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase";

type MonthPoint = { month: string; count: number };

const PAID_STATUS = ["paid", "PAID", "Paid"] as const;

const ANALYTICS_LOOKBACK_MONTHS = 6;

function analyticsWindowStartIso(lookbackMonths: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - lookbackMonths);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function currentMonthStartUtc8Iso(): string {
  // Ulaanbaatar time is UTC+8 (no DST). We derive yyyy-mm in that tz, then create a +08:00 date.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return new Date(`${y}-${m}-01T00:00:00+08:00`).toISOString();
}

async function bookingsHasPaymentAnalyticsColumns(supabase: SupabaseClient): Promise<boolean> {
  // Be conservative here: only require the columns we actually need to classify channels.
  // `paid_at` is optional and may not exist in some deployments.
  const { error } = await supabase
    .from("bookings")
    .select("payment_status, created_at")
    .limit(1);
  if (!error) return true;
  const msg = (error.message ?? "").toLowerCase();
  if (/column .* does not exist/i.test(msg)) return false;
  if (msg.includes("unknown column")) return false;
  if (/relation .* does not exist/i.test(msg)) return false;
  return true;
}

async function bookingsColumnExists(
  supabase: SupabaseClient,
  column: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("bookings")
    .select(column)
    .limit(1);
  return !error;
}


function classifyPaymentChannel(row: {
  payment_channel?: string | null;
  qpay_invoice_id?: string | null;
}): "qpay" | "sono" | "pocket" | "carepay" | "monpay" | "gymfintech" | "gift" | "other" {
  const raw = (row.payment_channel ?? "").trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "carepay" || raw === "care_pay") return "carepay";
  if (raw === "monpay" || raw === "mon_pay") return "monpay";
  if (raw === "gymfintech" || raw === "flexy" || raw === "gym_fintech") return "gymfintech";
  if (raw === "gift") return "gift";
  const inv = String(row.qpay_invoice_id ?? "").trim();
  if (inv.startsWith("GH")) return "sono";
  if (inv.length > 0) return "qpay";
  return "other";
}

function classifyLendingChannel(channel: string): "qpay" | "sono" | "pocket" | "carepay" | "monpay" | "gymfintech" | "gift" | "other" {
  const raw = channel.trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "carepay" || raw === "care_pay") return "carepay";
  if (raw === "monpay" || raw === "mon_pay") return "monpay";
  if (raw === "gymfintech" || raw === "flexy") return "gymfintech";
  if (raw === "gift") return "gift";
  return "other";
}

function isLendingPaidStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "paid" || s === "completed" || s === "success" || s === "succeeded" || s === "settled" || s === "approved" || s === "done";
}

function emptyChannels() {
  return { qpay: 0, sono: 0, pocket: 0, carepay: 0, monpay: 0, gymfintech: 0, gift: 0, other: 0 };
}

type RecentPayment = {
  id: string;
  amount: number | null;
  channel: ReturnType<typeof classifyPaymentChannel>;
  paid_at: string | null;
  user_name: string | null;
  user_phone: string | null;
};

/** Last N paid bookings with their resolved payment channel + buyer info (per-transaction view). */
async function fetchRecentPayments(
  supabase: SupabaseClient,
  limit = 25,
): Promise<RecentPayment[]> {
  const [hasPaymentChannel, hasQpayInvoiceId, hasPaidAt, hasAmount, hasUserId] =
    await Promise.all([
      bookingsColumnExists(supabase, "payment_channel"),
      bookingsColumnExists(supabase, "qpay_invoice_id"),
      bookingsColumnExists(supabase, "paid_at"),
      bookingsColumnExists(supabase, "amount"),
      bookingsColumnExists(supabase, "user_id"),
    ]);

  const selectCols = [
    "id",
    "payment_status",
    hasPaymentChannel ? "payment_channel" : null,
    hasQpayInvoiceId ? "qpay_invoice_id" : null,
    hasPaidAt ? "paid_at" : null,
    hasAmount ? "amount" : null,
    hasUserId ? "user_id" : null,
    "created_at",
  ]
    .filter(Boolean)
    .join(", ");

  let res = await supabase
    .from("bookings")
    .select(selectCols)
    .in("payment_status", [...PAID_STATUS])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) {
    res = await supabase
      .from("bookings")
      .select(selectCols)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(limit);
  }
  if (res.error) return [];

  const rows = (res.data ?? []) as unknown as Record<string, unknown>[];
  const paid = rows.filter(
    (r) => String(r.payment_status ?? "").trim().toLowerCase() === "paid",
  );

  const userIds = [
    ...new Set(paid.map((r) => String(r.user_id ?? "")).filter(Boolean)),
  ];
  const profById = new Map<string, { full_name: string | null; phone: string | null }>();
  if (hasUserId && userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", userIds);
    for (const p of (profs ?? []) as {
      id: string;
      full_name: string | null;
      phone: string | null;
    }[]) {
      profById.set(p.id, { full_name: p.full_name, phone: p.phone });
    }
  }

  return paid.map((r) => {
    const prof = profById.get(String(r.user_id ?? ""));
    const paidAt =
      typeof r.paid_at === "string"
        ? r.paid_at
        : typeof r.created_at === "string"
          ? r.created_at
          : null;
    return {
      id: String(r.id ?? ""),
      amount: r.amount != null ? Number(r.amount) : null,
      channel: classifyPaymentChannel(
        r as { payment_channel?: string | null; qpay_invoice_id?: string | null },
      ),
      paid_at: paidAt,
      user_name: prof?.full_name ?? null,
      user_phone: prof?.phone ?? null,
    };
  });
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
  // Service role key байхгүй тохиолдолд: auth verification хийгдсэний дараа
  // createAdminClient() ашиглана (auth context-гүй → RLS хязгаарлахгүй).
  // gym-monthly-stats-тай ижил хэлбэр.
  const sb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { client: null, error: "UNAUTHORIZED" };
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((prof as { role?: string } | null)?.role !== "admin") return { client: null, error: "FORBIDDEN" };
  return { client: createAdminClient(), error: null };
}

/**
 * Single-pass over paid bookings: collects both monthly counts and channel breakdown.
 * Halves the DB work compared to two separate scans.
 */
async function aggregateBookingsSinglePass(
  supabase: SupabaseClient,
  createdAtGte: string,
): Promise<{
  byMonth: MonthPoint[];
  channels: {
    qpay: number;
    sono: number;
    pocket: number;
    carepay: number;
    monpay: number;
    gymfintech: number;
    gift: number;
    other: number;
  };
}> {
  const channels = emptyChannels();
  const monthMap: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;

  const [hasPaymentChannel, hasQpayInvoiceId, hasPaidAt] = await Promise.all([
    bookingsColumnExists(supabase, "payment_channel"),
    bookingsColumnExists(supabase, "qpay_invoice_id"),
    bookingsColumnExists(supabase, "paid_at"),
  ]);

  const selectCols = [
    "payment_status",
    hasPaymentChannel ? "payment_channel" : null,
    hasQpayInvoiceId ? "qpay_invoice_id" : null,
    hasPaidAt ? "paid_at" : null,
    "created_at",
  ]
    .filter(Boolean)
    .join(", ");

  for (;;) {
    let res = await supabase
      .from("bookings")
      .select(selectCols)
      .gte("created_at", createdAtGte)
      .in("payment_status", [...PAID_STATUS])
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);

    // Some DBs have `payment_status` but don't support `.in()` well with mixed casing;
    // fallback to strict "paid".
    if (res.error) {
      res = await supabase
        .from("bookings")
        .select(selectCols)
        .gte("created_at", createdAtGte)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
    }
    if (res.error) throw new Error(res.error.message);

    const rows = res.data ?? [];
    for (const row of rows) {
      const s = String((row as unknown as Record<string, unknown>).payment_status ?? "").trim().toLowerCase();
      if (s !== "paid") continue;

      const bucket = classifyPaymentChannel(row as { payment_channel?: string | null; qpay_invoice_id?: string | null });
      channels[bucket]++;

      const raw =
        (row as unknown as Record<string, unknown>).paid_at ||
        (row as unknown as Record<string, unknown>).created_at;
      if (typeof raw === "string") {
        const month = raw.slice(0, 7);
        monthMap[month] = (monthMap[month] ?? 0) + 1;
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const byMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return { byMonth, channels };
}

async function aggregateFromLendingRecords(
  supabase: SupabaseClient,
  createdAtGte: string,
): Promise<{
  channels: {
    qpay: number;
    sono: number;
    pocket: number;
    carepay: number;
    monpay: number;
    gymfintech: number;
    gift: number;
    other: number;
  };
  byMonth: MonthPoint[];
} | null> {
  let selectCols = "channel, status, paid_at, created_at";
  let probe = await supabase.from("lending_records").select(selectCols).limit(1);
  if (probe.error?.message?.includes("paid_at")) {
    selectCols = "channel, status, created_at";
    probe = await supabase.from("lending_records").select(selectCols).limit(1);
  }
  if (probe.error) return null;

  const counts = emptyChannels();
  const monthMap: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("lending_records")
      .select(selectCols)
      .gte("created_at", createdAtGte)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as { channel?: string | null; status?: string | null; paid_at?: string | null; created_at?: string | null }[];
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

async function paginateMembershipStarts(
  supabase: SupabaseClient,
  startIso: string,
  capIso: string,
  pageSize: number,
): Promise<MonthPoint[]> {
  const monthMap: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("membership_started_at")
      .eq("role", "user")
      .not("membership_started_at", "is", null)
      .gte("membership_started_at", startIso)
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

async function aggregateCommissionsByMonth(
  supabase: SupabaseClient,
  startIso: string,
): Promise<MonthPoint[]> {
  const monthMap: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sales_commissions")
      .select("created_at, commission_amount")
      .gte("created_at", startIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (error.code === "42P01") return [];
      throw new Error(error.message);
    }
    const rows = data ?? [];
    for (const row of rows) {
      const createdAt = (row as { created_at?: string | null }).created_at;
      if (!createdAt) continue;
      const month = createdAt.slice(0, 7);
      const amount = Number((row as { commission_amount?: unknown }).commission_amount) || 0;
      monthMap[month] = (monthMap[month] ?? 0) + amount;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count: Math.round(count * 100) / 100 }));
}

async function aggregateVisitsByMonth(
  supabase: SupabaseClient,
  startIso: string,
): Promise<MonthPoint[]> {
  const monthMap: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("gym_visits")
      .select("checked_in_at, status")
      .gte("checked_in_at", startIso)
      .neq("status", "rejected")
      .order("checked_in_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (error.code === "42P01") return [];
      throw new Error(error.message);
    }
    const rows = data ?? [];
    for (const row of rows) {
      const checkedAt = (row as { checked_in_at?: string | null }).checked_in_at;
      if (!checkedAt) continue;
      const month = checkedAt.slice(0, 7);
      monthMap[month] = (monthMap[month] ?? 0) + 1;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

type FitnessMonthCount = { gym_id: string; gym_name: string | null; count: number };

// gym-visit-counts route-тай яг ижил хэлбэр: createAdminClient() шууд → RLS bypass
async function aggregateThisMonthFitnessCounts(
  _supabase: SupabaseClient,
  startIso: string,
): Promise<FitnessMonthCount[]> {
  const supabase = createAdminClient();
  const map = new Map<string, { gym_id: string; gym_name: string | null; count: number }>();
  const PAGE = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("gym_visits")
      .select("gym_id, gym_name")
      .neq("status", "rejected")
      .gte("checked_in_at", startIso)
      .range(from, from + PAGE - 1);

    if (error) {
      if (error.code === "42P01") return [];
      throw new Error(error.message);
    }

    for (const r of (data ?? []) as { gym_id?: string | null; gym_name?: string | null }[]) {
      const gymId = String(r.gym_id ?? "").trim();
      if (!gymId) continue;
      const existing = map.get(gymId);
      if (existing) {
        existing.count += 1;
        if (!existing.gym_name && r.gym_name) existing.gym_name = r.gym_name;
      } else {
        map.set(gymId, { gym_id: gymId, gym_name: r.gym_name ?? null, count: 1 });
      }
    }

    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** GET — aggregated dashboard chart + payment channel data. */
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
      return NextResponse.json({ error: "Supabase client үүсгэж чадсангүй." }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const windowStartIso = analyticsWindowStartIso(ANALYTICS_LOOKBACK_MONTHS);
    const thisMonthStartIso = currentMonthStartUtc8Iso();
    const PAGE = 1000;

    const [usersByMonth, useBookingsPayments, commissionsByMonth, visitsByMonth, thisMonthFitnessCounts, recentPayments] = await Promise.all([
      paginateMembershipStarts(supabase, windowStartIso, nowIso, PAGE),
      bookingsHasPaymentAnalyticsColumns(supabase),
      aggregateCommissionsByMonth(supabase, windowStartIso),
      aggregateVisitsByMonth(supabase, windowStartIso),
      aggregateThisMonthFitnessCounts(supabase, thisMonthStartIso),
      fetchRecentPayments(supabase),
    ]);

    let paymentsByMonth: MonthPoint[];
    let channelCounts: ReturnType<typeof emptyChannels>;
    let paymentsMonthsSource: "bookings" | "lending" | "membership_starts";

    if (useBookingsPayments) {
      const result = await aggregateBookingsSinglePass(supabase, windowStartIso);
      paymentsByMonth = result.byMonth;
      channelCounts = result.channels;
      paymentsMonthsSource = "bookings";
    } else {
      const lending = await aggregateFromLendingRecords(supabase, windowStartIso);
      if (lending) {
        paymentsByMonth = lending.byMonth;
        channelCounts = lending.channels;
        paymentsMonthsSource = "lending";
      } else {
        paymentsByMonth = [];
        channelCounts = emptyChannels();
        paymentsMonthsSource = "bookings";
      }
    }

    if (paymentsByMonth.length === 0 && usersByMonth.length > 0) {
      paymentsByMonth = usersByMonth.map((x) => ({ month: x.month, count: x.count }));
      paymentsMonthsSource = "membership_starts";
    }

    return NextResponse.json(
      {
        usersByMonth,
        paymentsByMonth,
        commissionsByMonth,
        visitsByMonth,
        paymentsMonthsSource,
        analyticsLookbackMonths: ANALYTICS_LOOKBACK_MONTHS,
        thisMonthFitnessCounts,
        paymentChannels: {
          qpay: channelCounts.qpay,
          sono: channelCounts.sono,
          pocket: channelCounts.pocket,
          carepay: channelCounts.carepay,
          monpay: channelCounts.monpay,
          gymfintech: channelCounts.gymfintech,
          gift: channelCounts.gift,
          other: channelCounts.other,
        },
        recentPayments,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
