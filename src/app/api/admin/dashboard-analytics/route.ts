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
  /** Flexy call лог — нэг төлбөрт олон удаа залгасан байж болно */
  call_count: number;
  last_called_at: string | null;
};

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

function buildFlexyByMonth(monthMap: Record<string, number>): MonthPoint[] {
  const today = todayInUlaanbaatar();
  const startMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const monthsWithData = Object.keys(monthMap).sort();
  if (monthsWithData.length === 0) return [];

  let overdueTotal = 0;
  for (const [m, amt] of Object.entries(monthMap)) {
    if (m < startMonth) overdueTotal += amt;
  }

  const futureKeys = monthsWithData.filter((m) => m >= startMonth);
  const endMonth = futureKeys.length > 0 ? futureKeys[futureKeys.length - 1] : startMonth;

  const out: MonthPoint[] = [];
  if (overdueTotal > 0) {
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

async function aggregateCommissionsByMonth(
  supabase: SupabaseClient,
  startIso: string,
): Promise<MonthPoint[]> {
  const { data, error } = await supabase.rpc("sales_commission_totals_by_month", {
    p_since: startIso,
  });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST202") return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as { month?: string; total_amount?: number | string }[])
    .map((row) => ({
      month: String(row.month ?? "").trim(),
      count: Math.round((Number(row.total_amount) || 0) * 100) / 100,
    }))
    .filter((r) => /^\d{4}-\d{2}$/.test(r.month))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** One GROUP BY instead of N exact-count round-trips. */
async function aggregateVisitsByMonth(
  supabase: SupabaseClient,
  lookbackMonths: number,
): Promise<MonthPoint[]> {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - (lookbackMonths - 1));
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase.rpc("gym_visit_counts_by_utc_month", {
    p_since: start.toISOString(),
  });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST202") return [];
    throw new Error(error.message);
  }

  const minMonth = start.toISOString().slice(0, 7);
  return ((data ?? []) as { month?: string; visitor_count?: number | string }[])
    .map((row) => ({
      month: String(row.month ?? "").trim(),
      count: Number(row.visitor_count) || 0,
    }))
    .filter((r) => /^\d{4}-\d{2}$/.test(r.month) && r.month >= minMonth && r.count > 0);
}

type FitnessMonthCount = {
  gym_id: string;
  gym_name: string | null;
  image_url: string | null;
  count: number;
};

async function aggregateThisMonthFitnessCounts(
  supabase: SupabaseClient,
  startIso: string,
): Promise<FitnessMonthCount[]> {
  const { data, error } = await supabase.rpc("gym_visit_counts_since", {
    p_since: startIso,
  });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST202") return [];
    throw new Error(error.message);
  }

  const map = new Map<
    string,
    { gym_id: string; gym_name: string | null; image_url: string | null; count: number }
  >();
  for (const r of (data ?? []) as { gym_id?: string | null; visitor_count?: number | string | null }[]) {
    const gymId = String(r.gym_id ?? "").trim();
    if (!gymId) continue;
    map.set(gymId, {
      gym_id: gymId,
      gym_name: null,
      image_url: null,
      count: Number(r.visitor_count) || 0,
    });
  }

  const gymIds = [...map.keys()];
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
      if (g.name) row.gym_name = g.name;
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
 * Нэг удаагийн Flexy fetch: сарын нийлбэр + ойрын төлбөр (өмнө 2× plans/payments байсан).
 */
async function loadFlexyDashboard(
  supabase: SupabaseClient,
  limit = 40,
): Promise<{
  flexyByMonth: MonthPoint[];
  people: FlexyUpcomingPerson[];
  byDue: FlexyDuePoint[];
}> {
  const empty = {
    flexyByMonth: [] as MonthPoint[],
    people: [] as FlexyUpcomingPerson[],
    byDue: [] as FlexyDuePoint[],
  };

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
  const monthMap: Record<string, number> = {};
  const nextByPlan = new Map<
    string,
    { id: string; amount: number; due_date: string; installment_no: number }
  >();

  const CHUNK = 200;
  for (let i = 0; i < planIds.length; i += CHUNK) {
    const chunk = planIds.slice(i, i + CHUNK);
    const paidRes = await supabase
      .from("installment_payments")
      .select("id, plan_id, amount, due_date, status, installment_no")
      .in("plan_id", chunk)
      .in("status", ["pending", "invoice_created", "overdue"])
      .order("due_date", { ascending: true });

    let payments = paidRes.data;
    if (paidRes.error) {
      const fallback = await supabase
        .from("installment_payments")
        .select("id, plan_id, amount, due_date, status, installment_no")
        .in("plan_id", chunk)
        .neq("status", "paid")
        .order("due_date", { ascending: true });
      if (fallback.error) {
        if (fallback.error.code === "42P01") return empty;
        console.warn("[dashboard-analytics] flexy payments:", paidRes.error.message);
        continue;
      }
      payments = fallback.data;
    }

    for (const row of payments ?? []) {
      addFlexyDueMonthAmount(monthMap, row);
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

  const peopleBase = nextRows.slice(0, limit).map((r) => {
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
      call_count: 0,
      last_called_at: null as string | null,
    };
  });

  const paymentIds = peopleBase.map((p) => p.payment_id);
  if (paymentIds.length > 0) {
    const { data: callRows, error: callErr } = await supabase
      .from("flexy_call_logs")
      .select("payment_id, called_at")
      .in("payment_id", paymentIds)
      .order("called_at", { ascending: false });
    if (callErr) {
      if (callErr.code !== "42P01") {
        console.warn("[dashboard-analytics] flexy_call_logs:", callErr.message);
      }
    } else {
      const byPayment = new Map<string, { count: number; last: string }>();
      for (const row of callRows ?? []) {
        const cur = byPayment.get(row.payment_id);
        if (!cur) {
          byPayment.set(row.payment_id, { count: 1, last: row.called_at });
        } else {
          cur.count += 1;
        }
      }
      for (const p of peopleBase) {
        const s = byPayment.get(p.payment_id);
        if (!s) continue;
        p.call_count = s.count;
        p.last_called_at = s.last;
      }
    }
  }

  const people: FlexyUpcomingPerson[] = peopleBase;

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

  return {
    flexyByMonth: buildFlexyByMonth(monthMap),
    people,
    byDue,
  };
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

    const windowStartIso = analyticsWindowStartIso(ANALYTICS_LOOKBACK_MONTHS);
    const thisMonthStartIso = currentMonthStartUtc8Iso();

    // Dashboard UI-д хэрэгтэй 4 зүйл л — bookings/membership/recentPayments-ийг хассан (хоосон stub).
    const [commissionsByMonth, visitsByMonth, thisMonthFitnessCounts, flexy] =
      await Promise.all([
        aggregateCommissionsByMonth(supabase, windowStartIso),
        aggregateVisitsByMonth(supabase, ANALYTICS_LOOKBACK_MONTHS),
        aggregateThisMonthFitnessCounts(supabase, thisMonthStartIso),
        loadFlexyDashboard(supabase),
      ]);

    return NextResponse.json(
      {
        usersByMonth: [] as MonthPoint[],
        paymentsByMonth: [] as MonthPoint[],
        commissionsByMonth,
        visitsByMonth,
        paymentsMonthsSource: "bookings" as const,
        analyticsLookbackMonths: ANALYTICS_LOOKBACK_MONTHS,
        thisMonthFitnessCounts,
        flexyByMonth: flexy.flexyByMonth,
        flexyUpcomingByDue: flexy.byDue,
        flexyUpcomingPeople: flexy.people,
        paymentChannels: {
          qpay: 0,
          sono: 0,
          pocket: 0,
          carepay: 0,
          monpay: 0,
          gymfintech: 0,
          gift: 0,
          other: 0,
        },
        recentPayments: [],
      },
      {
        headers: {
          // Flexy call marks must not stick behind a stale browser cache.
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
