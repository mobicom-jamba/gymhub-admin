import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase";
import {
  parseLocalDateOnly,
  todayInUlaanbaatar,
  toLocalDateString,
} from "@/lib/installment-schedule";

type MonthPoint = { month: string; count: number };

/** Flexy: due_date-аар нэгтгэсэн төлөгдөөгүй хуваарь (график) */
type FlexyDuePoint = {
  due_date: string; // YYYY-MM-DD
  amount: number;
  count: number;
  /** 0 = өнөөдөр, сөрөг = хэтэрсэн */
  days_until: number;
};

/** Flexy: төлөвлөгөө бүрийн дараагийн төлөлт + хэрэглэгч */
type FlexyUpcomingPerson = {
  payment_id: string;
  plan_id: string;
  user_id: string;
  user_name: string | null;
  user_phone: string | null;
  amount: number;
  due_date: string;
  days_until: number;
  installment_no: number;
};

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
}): "qpay" | "sono" | "pocket" | "carepay" | "monpay" | "gymfintech" | "gift" | "admin" | "other" {
  const raw = (row.payment_channel ?? "").trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "carepay" || raw === "care_pay") return "carepay";
  if (raw === "monpay" || raw === "mon_pay") return "monpay";
  if (raw === "gymfintech" || raw === "flexy" || raw === "gym_fintech") return "gymfintech";
  if (raw === "gift" || raw === "admin" || raw === "manual" || raw === "admin_grant") {
    return "gift";
  }
  const inv = String(row.qpay_invoice_id ?? "").trim();
  if (inv.startsWith("GH")) return "sono";
  if (/^\d{8}-\d+-\d+-\d+$/.test(inv)) return "carepay";
  if (inv.length > 0) return "qpay";
  return "other";
}

function classifyLendingChannel(channel: string): "qpay" | "sono" | "pocket" | "carepay" | "monpay" | "gymfintech" | "gift" | "admin" | "other" {
  const raw = channel.trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "carepay" || raw === "care_pay") return "carepay";
  if (raw === "monpay" || raw === "mon_pay") return "monpay";
  if (raw === "gymfintech" || raw === "flexy") return "gymfintech";
  if (raw === "gift" || raw === "admin" || raw === "manual" || raw === "admin_grant") {
    return "gift";
  }
  return "other";
}

function isLendingPaidStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "paid" || s === "completed" || s === "success" || s === "succeeded" || s === "settled" || s === "approved" || s === "done";
}

function emptyChannels() {
  return {
    qpay: 0,
    sono: 0,
    pocket: 0,
    carepay: 0,
    monpay: 0,
    gymfintech: 0,
    gift: 0,
    admin: 0,
    other: 0,
  };
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
    admin: number;
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
    admin: number;
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

/**
 * Сар бүрт Flexy-ээс орох ёстой НИЙТ дүн.
 * Жишээ: 8-р сар 800,000₮, 9-р сар 900,000₮, 10-р сар 1,000,000₮…
 * Идэвхтэй төлөвлөгөөний бүх төлөгдөөгүй хуваарийг due_date-ийн сараар нийлнэ.
 * `count` = төгрөгийн дүн.
 */
async function aggregateFlexyDueAmountByMonth(
  _supabase: SupabaseClient,
): Promise<MonthPoint[]> {
  // RLS-ээс хамааралгүй — fitness counts-тай адил service role
  const supabase = createAdminClient();

  const { data: plans, error: plansErr } = await supabase
    .from("installment_plans")
    .select("id")
    .eq("status", "active");

  if (plansErr) {
    if (plansErr.code === "42P01") return [];
    console.warn("[dashboard-analytics] flexy due by month plans:", plansErr.message);
    return [];
  }
  if (!plans?.length) return [];

  const planIds = plans.map((p) => p.id);
  const monthMap: Record<string, number> = {};
  const CHUNK = 200;

  for (let i = 0; i < planIds.length; i += CHUNK) {
    const chunk = planIds.slice(i, i + CHUNK);
    const { data: payments, error: payErr } = await supabase
      .from("installment_payments")
      .select("amount, due_date, status")
      .in("plan_id", chunk)
      .in("status", ["pending", "invoice_created", "overdue"]);

    if (payErr) {
      // status filter алдаатай бол neq paid-руу ухраа
      const fallback = await supabase
        .from("installment_payments")
        .select("amount, due_date, status")
        .in("plan_id", chunk)
        .neq("status", "paid");
      if (fallback.error) {
        if (fallback.error.code === "42P01") return [];
        console.warn("[dashboard-analytics] flexy due by month payments:", payErr.message);
        continue;
      }
      for (const row of fallback.data ?? []) {
        addFlexyDueMonthAmount(monthMap, row);
      }
      continue;
    }

    for (const row of payments ?? []) {
      addFlexyDueMonthAmount(monthMap, row);
    }
  }

  const today = todayInUlaanbaatar();
  const startMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const monthsWithData = Object.keys(monthMap).sort();
  if (monthsWithData.length === 0) return [];

  // Өнгөрсөн сарын хэтэрсэнийг тусад нь хадгалаад, одоогийн+ирээдүйн саруудыг due_date-аар үлдээнэ
  let overdueTotal = 0;
  for (const [m, amt] of Object.entries(monthMap)) {
    if (m < startMonth) overdueTotal += amt;
  }

  const futureKeys = monthsWithData.filter((m) => m >= startMonth);
  const endMonth =
    futureKeys.length > 0
      ? futureKeys[futureKeys.length - 1]
      : startMonth;

  const out: MonthPoint[] = [];
  if (overdueTotal > 0) {
    // Тусгай түлхүүр — UI "Хэтэрсэн" гэж харуулна
    out.push({ month: "overdue", count: overdueTotal });
  }

  let y = Number(startMonth.slice(0, 4));
  let mo = Number(startMonth.slice(5, 7));
  const endY = Number(endMonth.slice(0, 4));
  const endMo = Number(endMonth.slice(5, 7));

  while (y < endY || (y === endY && mo <= endMo)) {
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    out.push({ month: key, count: monthMap[key] ?? 0 });
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
    if (out.length > 36) break;
  }

  return out;
}

function addFlexyDueMonthAmount(
  monthMap: Record<string, number>,
  row: { amount?: unknown; due_date?: unknown },
) {
  const dueRaw = String(row.due_date ?? "").trim();
  if (!dueRaw) return;
  const due = /^\d{4}-\d{2}-\d{2}/.test(dueRaw)
    ? dueRaw.slice(0, 10)
    : toLocalDateString(parseLocalDateOnly(dueRaw));
  const month = due.slice(0, 7);
  if (month.length !== 7) return;
  monthMap[month] = (monthMap[month] ?? 0) + (Number(row.amount) || 0);
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

type FitnessMonthCount = {
  gym_id: string;
  gym_name: string | null;
  image_url: string | null;
  count: number;
};

// gym-visit-counts route-тай яг ижил хэлбэр: createAdminClient() шууд → RLS bypass
async function aggregateThisMonthFitnessCounts(
  _supabase: SupabaseClient,
  startIso: string,
): Promise<FitnessMonthCount[]> {
  const supabase = createAdminClient();
  const map = new Map<
    string,
    { gym_id: string; gym_name: string | null; image_url: string | null; count: number }
  >();
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
        map.set(gymId, {
          gym_id: gymId,
          gym_name: r.gym_name ?? null,
          image_url: null,
          count: 1,
        });
      }
    }

    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  const rows = [...map.values()];
  const gymIds = rows.map((r) => r.gym_id);
  const CHUNK = 200;
  for (let i = 0; i < gymIds.length; i += CHUNK) {
    const chunk = gymIds.slice(i, i + CHUNK);
    const { data: gyms } = await supabase
      .from("gyms")
      .select("id, name, image_url")
      .in("id", chunk);
    for (const g of (gyms ?? []) as {
      id: string;
      name: string | null;
      image_url: string | null;
    }[]) {
      const row = map.get(g.id);
      if (!row) continue;
      if (g.image_url) row.image_url = g.image_url;
      if (!row.gym_name && g.name) row.gym_name = g.name;
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function calendarDaysUntil(dueDate: string, today: Date): number {
  const due = parseLocalDateOnly(dueDate);
  const ms = due.getTime() - today.getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Flexy идэвхтэй төлөвлөгөө бүрийн дараагийн (хамгийн ойрын) төлөгдөөгүй хуваарь + profile.
 * due_date өсөхөөр эрэмбэлнэ (хэтэрсэн эхэнд).
 */
async function fetchFlexyUpcomingPeople(
  supabase: SupabaseClient,
  limit = 40,
): Promise<{ people: FlexyUpcomingPerson[]; byDue: FlexyDuePoint[] }> {
  const empty = { people: [] as FlexyUpcomingPerson[], byDue: [] as FlexyDuePoint[] };

  const { data: plans, error: plansErr } = await supabase
    .from("installment_plans")
    .select("id, user_id")
    .eq("status", "active");

  if (plansErr) {
    if (plansErr.code === "42P01") return empty;
    console.warn("[dashboard-analytics] flexy plans:", plansErr.message);
    return empty;
  }
  if (!plans?.length) return empty;

  const planById = new Map(plans.map((p) => [p.id, p]));
  const planIds = plans.map((p) => p.id);
  const today = todayInUlaanbaatar();

  /** plan_id → хамгийн ойрын unpaid payment */
  const nextByPlan = new Map<
    string,
    {
      id: string;
      amount: number;
      due_date: string;
      installment_no: number;
    }
  >();

  const CHUNK = 200;
  for (let i = 0; i < planIds.length; i += CHUNK) {
    const chunk = planIds.slice(i, i + CHUNK);
    const { data: payments, error: payErr } = await supabase
      .from("installment_payments")
      .select("id, plan_id, amount, due_date, status, installment_no")
      .in("plan_id", chunk)
      .neq("status", "paid")
      .order("due_date", { ascending: true });

    if (payErr) {
      if (payErr.code === "42P01") return empty;
      console.warn("[dashboard-analytics] flexy payments:", payErr.message);
      continue;
    }

    for (const row of payments ?? []) {
      const planId = String(row.plan_id ?? "");
      if (!planId || nextByPlan.has(planId)) continue;
      const dueRaw = String(row.due_date ?? "").trim();
      if (!dueRaw) continue;
      const due = /^\d{4}-\d{2}-\d{2}/.test(dueRaw)
        ? dueRaw.slice(0, 10)
        : toLocalDateString(parseLocalDateOnly(dueRaw));
      nextByPlan.set(planId, {
        id: String(row.id),
        amount: Number(row.amount) || 0,
        due_date: due,
        installment_no: Number(row.installment_no) || 0,
      });
    }
  }

  const nextRows = [...nextByPlan.entries()]
    .map(([plan_id, pay]) => {
      const plan = planById.get(plan_id);
      return {
        payment_id: pay.id,
        plan_id,
        user_id: String(plan?.user_id ?? ""),
        amount: pay.amount,
        due_date: pay.due_date,
        installment_no: pay.installment_no,
      };
    })
    .filter((r) => r.user_id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const userIds = [...new Set(nextRows.map((r) => r.user_id))];
  const profById = new Map<string, { full_name: string | null; phone: string | null }>();
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", chunk);
    for (const p of (profs ?? []) as {
      id: string;
      full_name: string | null;
      phone: string | null;
    }[]) {
      profById.set(p.id, { full_name: p.full_name, phone: p.phone });
    }
  }

  const people: FlexyUpcomingPerson[] = nextRows.slice(0, limit).map((r) => {
    const prof = profById.get(r.user_id);
    return {
      payment_id: r.payment_id,
      plan_id: r.plan_id,
      user_id: r.user_id,
      user_name: prof?.full_name ?? null,
      user_phone: prof?.phone ?? null,
      amount: r.amount,
      due_date: r.due_date,
      days_until: calendarDaysUntil(r.due_date, today),
      installment_no: r.installment_no,
    };
  });

  const byDueMap = new Map<string, { amount: number; count: number }>();
  for (const p of nextRows) {
    const prev = byDueMap.get(p.due_date);
    if (prev) {
      prev.amount += p.amount;
      prev.count += 1;
    } else {
      byDueMap.set(p.due_date, { amount: p.amount, count: 1 });
    }
  }
  const byDue: FlexyDuePoint[] = [...byDueMap.entries()]
    .map(([due_date, v]) => ({
      due_date,
      amount: v.amount,
      count: v.count,
      days_until: calendarDaysUntil(due_date, today),
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 12);

  return { people, byDue };
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

    const [
      usersByMonth,
      useBookingsPayments,
      commissionsByMonth,
      visitsByMonth,
      thisMonthFitnessCounts,
      recentPayments,
      flexyUpcoming,
      flexyByMonth,
    ] = await Promise.all([
      paginateMembershipStarts(supabase, windowStartIso, nowIso, PAGE),
      bookingsHasPaymentAnalyticsColumns(supabase),
      aggregateCommissionsByMonth(supabase, windowStartIso),
      aggregateVisitsByMonth(supabase, windowStartIso),
      aggregateThisMonthFitnessCounts(supabase, thisMonthStartIso),
      fetchRecentPayments(supabase),
      fetchFlexyUpcomingPeople(supabase),
      aggregateFlexyDueAmountByMonth(supabase),
    ]);
    const flexyUpcomingByDue = flexyUpcoming.byDue;
    const flexyUpcomingPeople = flexyUpcoming.people;

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
        flexyByMonth,
        flexyUpcomingByDue,
        flexyUpcomingPeople,
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
