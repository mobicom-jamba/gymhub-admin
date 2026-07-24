import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

type BillingMode = "per_entry" | "monthly_fixed";

type GymRow = {
  id: string;
  name: string | null;
  city: string | null;
  type: string | null;
  is_active: boolean | null;
  image_url: string | null;
  billing_mode: BillingMode | null;
  billing_amount_mnt: number | null;
  sort_order: number | null;
};

type SettlementRow = {
  id: string;
  gym_id: string;
  month: string;
  visit_count: number;
  billing_mode: BillingMode | null;
  unit_amount_mnt: number | null;
  computed_amount_mnt: number;
  amount_mnt: number;
  notes: string | null;
  status: "draft" | "confirmed";
  updated_at: string;
};

function monthBoundsUtc(month: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  // Mongolia UTC+8: month start 00:00 MN = previous day 16:00 UTC
  const startUtc = Date.UTC(y, m - 1, 1, 0, 0, 0) - 8 * 3600 * 1000;
  const endUtc = Date.UTC(y, m, 1, 0, 0, 0) - 8 * 3600 * 1000;
  return {
    startIso: new Date(startUtc).toISOString(),
    endIso: new Date(endUtc).toISOString(),
  };
}

function currentMonthMn(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonthMn(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function computeAmount(
  mode: BillingMode | null | undefined,
  unit: number | null | undefined,
  visits: number,
): number {
  if (!mode || unit == null || unit < 0) return 0;
  if (mode === "per_entry") return visits * unit;
  if (mode === "monthly_fixed") return unit;
  return 0;
}

async function countVisitsByGym(
  supabase: ReturnType<typeof createAdminClient>,
  startIso: string,
  endIso: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("gym_visits")
      .select("gym_id")
      .neq("status", "rejected")
      .gte("checked_in_at", startIso)
      .lt("checked_in_at", endIso)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = (row as { gym_id?: string | null }).gym_id;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return counts;
}

/** Mongolia calendar month YYYY-MM for an ISO timestamp. */
function monthKeyMn(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = shiftMonthKey(cur, 1);
  }
  return out;
}

type ExportRow = {
  gym_id: string;
  name: string | null;
  city: string | null;
  type: string | null;
  is_active: boolean | null;
  image_url: string | null;
  billing_mode: BillingMode | null;
  unit_amount_mnt: number | null;
  visit_count: number;
  computed_amount_mnt: number;
  amount_mnt: number;
  notes: string | null;
  status: "draft" | "confirmed";
  settlement_id: string | null;
  is_edited: boolean;
  has_billing: boolean;
};

function buildMonthRows(
  gyms: GymRow[],
  visitCounts: Record<string, number>,
  savedByGym: Map<string, SettlementRow>,
): ExportRow[] {
  const rows = gyms.map((gym) => {
    const visits = visitCounts[gym.id] ?? 0;
    const computed = computeAmount(gym.billing_mode, gym.billing_amount_mnt, visits);
    const settlement = savedByGym.get(gym.id) ?? null;
    const amount = settlement?.amount_mnt ?? computed;
    const isEdited =
      !!settlement &&
      (settlement.amount_mnt !== settlement.computed_amount_mnt ||
        !!settlement.notes ||
        settlement.status === "confirmed");
    return {
      gym_id: gym.id,
      name: gym.name,
      city: gym.city,
      type: gym.type,
      is_active: gym.is_active,
      image_url: gym.image_url,
      billing_mode: gym.billing_mode,
      unit_amount_mnt: gym.billing_amount_mnt,
      visit_count: visits,
      computed_amount_mnt: computed,
      amount_mnt: amount,
      notes: settlement?.notes ?? null,
      status: (settlement?.status ?? "draft") as "draft" | "confirmed",
      settlement_id: settlement?.id ?? null,
      is_edited: isEdited,
      has_billing: !!gym.billing_mode && gym.billing_amount_mnt != null,
    };
  });

  rows.sort((a, b) => {
    const score = (r: ExportRow) =>
      (r.has_billing ? 4 : 0) + (r.visit_count > 0 ? 2 : 0) + (r.is_active ? 1 : 0);
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return (a.name ?? "").localeCompare(b.name ?? "", "mn");
  });
  return rows;
}

async function loadAllVisitsByMonth(
  supabase: ReturnType<typeof createAdminClient>,
  startIso: string,
  endIso: string,
): Promise<Record<string, Record<string, number>>> {
  const byMonth: Record<string, Record<string, number>> = {};
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("gym_visits")
      .select("gym_id, checked_in_at")
      .neq("status", "rejected")
      .gte("checked_in_at", startIso)
      .lt("checked_in_at", endIso)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as { gym_id?: string | null; checked_in_at?: string | null };
      if (!r.gym_id || !r.checked_in_at) continue;
      const mk = monthKeyMn(r.checked_in_at);
      if (!byMonth[mk]) byMonth[mk] = {};
      byMonth[mk][r.gym_id] = (byMonth[mk][r.gym_id] ?? 0) + 1;
    }
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return byMonth;
}

/**
 * GET /api/admin/settlements?month=YYYY-MM
 * GET /api/admin/settlements?all=1  — every month from first activity through current month
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const supabase = createAdminClient();
    const current = currentMonthMn();
    const previous = previousMonthMn();

    if (searchParams.get("all") === "1") {
      const [{ data: gyms, error: gymErr }, { data: saved, error: savErr }, { data: firstVisit }] =
        await Promise.all([
          supabase
            .from("gyms")
            .select(
              "id, name, city, type, is_active, image_url, billing_mode, billing_amount_mnt, sort_order",
            )
            .order("sort_order", { ascending: true }),
          supabase.from("gym_billing_settlements").select("*"),
          supabase
            .from("gym_visits")
            .select("checked_in_at")
            .neq("status", "rejected")
            .order("checked_in_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

      if (gymErr) return NextResponse.json({ error: gymErr.message }, { status: 500 });
      if (savErr) return NextResponse.json({ error: savErr.message }, { status: 500 });

      const settlementMonths = ((saved ?? []) as SettlementRow[])
        .map((s) => s.month)
        .filter((m) => /^\d{4}-\d{2}$/.test(m));
      const visitStart = firstVisit?.checked_in_at
        ? monthKeyMn(firstVisit.checked_in_at as string)
        : null;
      const candidates = [...settlementMonths, ...(visitStart ? [visitStart] : []), previous];
      const startMonth = candidates.reduce((a, b) => (a < b ? a : b));
      const monthList = monthsInclusive(startMonth, current);

      const rangeStart = monthBoundsUtc(startMonth)!;
      const rangeEnd = monthBoundsUtc(shiftMonthKey(current, 1))!;
      const visitsByMonth = await loadAllVisitsByMonth(
        supabase,
        rangeStart.startIso,
        rangeEnd.startIso,
      );

      const savedByMonthGym = new Map<string, SettlementRow>();
      for (const row of (saved ?? []) as SettlementRow[]) {
        savedByMonthGym.set(`${row.month}:${row.gym_id}`, row);
      }

      const gymList = (gyms ?? []) as GymRow[];
      const months = monthList.map((month) => {
        const visitCounts = visitsByMonth[month] ?? {};
        const savedByGym = new Map<string, SettlementRow>();
        for (const gym of gymList) {
          const s = savedByMonthGym.get(`${month}:${gym.id}`);
          if (s) savedByGym.set(gym.id, s);
        }
        const rows = buildMonthRows(gymList, visitCounts, savedByGym);
        const total_amount_mnt = rows.reduce(
          (s, r) => s + (r.has_billing || r.settlement_id ? r.amount_mnt : 0),
          0,
        );
        const total_visits = rows.reduce((s, r) => s + r.visit_count, 0);
        const billed_count = rows.filter((r) => r.has_billing || r.settlement_id).length;
        return { month, total_amount_mnt, total_visits, billed_count, rows };
      });

      return NextResponse.json({
        all: true,
        current_month: current,
        previous_month: previous,
        months,
      });
    }

    const month = (searchParams.get("month") ?? previous).trim();
    const bounds = monthBoundsUtc(month);
    if (!bounds) {
      return NextResponse.json({ error: "month формат YYYY-MM байх ёстой." }, { status: 400 });
    }

    const [{ data: gyms, error: gymErr }, { data: saved, error: savErr }, visitCounts] =
      await Promise.all([
        supabase
          .from("gyms")
          .select(
            "id, name, city, type, is_active, image_url, billing_mode, billing_amount_mnt, sort_order",
          )
          .order("sort_order", { ascending: true }),
        supabase.from("gym_billing_settlements").select("*").eq("month", month),
        countVisitsByGym(supabase, bounds.startIso, bounds.endIso),
      ]);

    if (gymErr) return NextResponse.json({ error: gymErr.message }, { status: 500 });
    if (savErr) return NextResponse.json({ error: savErr.message }, { status: 500 });

    const savedByGym = new Map<string, SettlementRow>();
    for (const row of (saved ?? []) as SettlementRow[]) {
      savedByGym.set(row.gym_id, row);
    }

    const rows = buildMonthRows((gyms ?? []) as GymRow[], visitCounts, savedByGym);

    const totalAmount = rows.reduce(
      (s, r) => s + (r.has_billing || r.settlement_id ? r.amount_mnt : 0),
      0,
    );
    const totalVisits = rows.reduce((s, r) => s + r.visit_count, 0);
    const billedCount = rows.filter((r) => r.has_billing || r.settlement_id).length;

    return NextResponse.json({
      month,
      current_month: current,
      previous_month: previous,
      total_amount_mnt: totalAmount,
      total_visits: totalVisits,
      billed_count: billedCount,
      rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/admin/settlements
 * Body: {
 *   month,
 *   update_gym_billing?: boolean, // also write billing_mode/amount onto gyms
 *   rows: [{ gym_id, amount_mnt, notes?, status?, visit_count?, billing_mode?, unit_amount_mnt?, computed_amount_mnt? }]
 * }
 */
export async function PUT(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const body = (await request.json()) as {
      month?: string;
      update_gym_billing?: boolean;
      rows?: Array<{
        gym_id: string;
        amount_mnt: number;
        notes?: string | null;
        status?: "draft" | "confirmed";
        visit_count?: number;
        billing_mode?: BillingMode | null;
        unit_amount_mnt?: number | null;
        computed_amount_mnt?: number;
      }>;
    };

    const month = (body.month ?? "").trim();
    if (!monthBoundsUtc(month)) {
      return NextResponse.json({ error: "month формат YYYY-MM байх ёстой." }, { status: 400 });
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "rows шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const updateGymBilling = body.update_gym_billing !== false;

    if (updateGymBilling) {
      for (const r of body.rows) {
        const mode =
          r.billing_mode === "per_entry" || r.billing_mode === "monthly_fixed"
            ? r.billing_mode
            : null;
        let unit: number | null = null;
        if (mode != null) {
          const n = Math.round(Number(r.unit_amount_mnt));
          if (!Number.isFinite(n) || n < 0) {
            return NextResponse.json(
              { error: `${r.gym_id}: үнийн дүн буруу.` },
              { status: 400 },
            );
          }
          unit = n;
        }
        const { error: gymErr } = await supabase
          .from("gyms")
          .update({
            billing_mode: mode,
            billing_amount_mnt: unit,
            updated_at: now,
          })
          .eq("id", r.gym_id);
        if (gymErr) {
          return NextResponse.json({ error: gymErr.message }, { status: 500 });
        }
      }
    }

    const payload = body.rows.map((r) => {
      const mode =
        r.billing_mode === "per_entry" || r.billing_mode === "monthly_fixed"
          ? r.billing_mode
          : null;
      const unit =
        mode == null
          ? null
          : Math.max(0, Math.round(Number(r.unit_amount_mnt) || 0));
      const visitCount = Math.max(0, Math.round(Number(r.visit_count) || 0));
      const computed = Math.max(
        0,
        Math.round(
          Number(r.computed_amount_mnt) ||
            computeAmount(mode, unit, visitCount),
        ),
      );
      // Final amount may be negative (алдагдал / loss).
      const rawAmount = Math.round(Number(r.amount_mnt));
      const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
      return {
        gym_id: r.gym_id,
        month,
        visit_count: visitCount,
        billing_mode: mode,
        unit_amount_mnt: unit,
        computed_amount_mnt: computed,
        amount_mnt: amount,
        notes: r.notes?.trim() ? r.notes.trim() : null,
        status: r.status === "confirmed" ? "confirmed" : "draft",
        updated_by: auth.userId,
        updated_at: now,
      };
    });

    const { data, error } = await supabase
      .from("gym_billing_settlements")
      .upsert(payload, { onConflict: "gym_id,month" })
      .select("id, gym_id, amount_mnt, status, notes, updated_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, saved: data?.length ?? 0, rows: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
