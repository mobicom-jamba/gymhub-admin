import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireSalesOrAdmin } from "@/lib/verify-sales-access";

/** GET — sales dashboard: promo codes, commission total, recent transactions */
export async function GET(request: Request) {
  try {
    const auth = await requireSalesOrAdmin(request);
    if (!auth.ok) return auth.response;
    if (auth.isAdmin) {
      return NextResponse.json(
        { error: "Энэ дашборд зөвхөн борлуулалтын эрхтэй хэрэглэгчид зориулагдсан" },
        { status: 403 },
      );
    }

    const supabase = createAdminClient();
    const targetSalesId = auth.userId;

    const [promosRes, sumRes, recentRes, profileRes, usersCountRes, usersRecentRes, gymsRes, orgsRes, requestRes] =
      await Promise.all([
      supabase
        .from("sales_promo_codes")
        .select("code, commission_rate, is_active, created_at")
        .eq("sales_user_id", targetSalesId)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("sales_commissions")
        .select("commission_amount, gross_amount")
        .eq("sales_user_id", targetSalesId)
        .limit(5000),

      supabase
        .from("sales_commissions")
        .select("booking_id, gross_amount, commission_amount, commission_rate, created_at, buyer_user_id")
        .eq("sales_user_id", targetSalesId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("profiles")
        .select("full_name, phone, role")
        .eq("id", targetSalesId)
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "user"),

      supabase
        .from("profiles")
        .select("id, full_name, phone, organization, created_at")
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("gyms")
        .select("id, name, address, lat, lng, is_active")
        .eq("is_active", true)
        .order("name")
        .limit(500),

      supabase
        .from("organizations")
        .select("id, name, created_at, created_by")
        .eq("created_by", targetSalesId)
        .order("created_at", { ascending: false })
        .limit(200),

      supabase
        .from("sales_commission_requests")
        .select("id, requested_rate, approved_rate, status, note, review_note, created_at, reviewed_at")
        .eq("sales_user_id", targetSalesId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (promosRes.error && promosRes.error.code !== "42P01") {
      return NextResponse.json({ error: promosRes.error.message }, { status: 500 });
    }
    if (recentRes.error && recentRes.error.code !== "42P01") {
      return NextResponse.json({ error: recentRes.error.message }, { status: 500 });
    }

    const totalCommission = (sumRes.data ?? []).reduce(
      (acc, r) => acc + (Number((r as { commission_amount?: unknown }).commission_amount) || 0),
      0,
    );
    const totalGrossRevenue = (sumRes.data ?? []).reduce(
      (acc, r) => acc + (Number((r as { gross_amount?: unknown }).gross_amount) || 0),
      0,
    );
    const promoCodes = (promosRes.data ?? []).map((row) => ({
      ...row,
      commission_percent: Math.round(Number(row.commission_rate ?? 0) * 10000) / 100,
    }));
    const activePromo = promoCodes.find((p) => p.is_active) ?? null;

    let organizations = (orgsRes.data ?? []) as Array<{
      id: string;
      name: string;
      created_at: string;
      created_by?: string | null;
    }>;
    if (orgsRes.error && orgsRes.error.message?.includes("created_by")) {
      const fallback = await supabase
        .from("organizations")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      organizations = (fallback.data ?? []) as Array<{ id: string; name: string; created_at: string }>;
    }

    return NextResponse.json(
      {
        profile: profileRes.data ?? null,
        promo_codes: promoCodes,
        active_commission_rate: Number(activePromo?.commission_rate ?? 0.05),
        active_commission_percent: Math.round(Number(activePromo?.commission_rate ?? 0.05) * 10000) / 100,
        commission_total: Math.round(totalCommission * 100) / 100,
        registration_revenue_total: Math.round(totalGrossRevenue * 100) / 100,
        commission_count: sumRes.data?.length ?? 0,
        recent_commissions: recentRes.data ?? [],
        registered_users_total: usersCountRes.count ?? 0,
        registered_users: usersRecentRes.data ?? [],
        organizations_registered_by_sales: organizations,
        commission_requests: (requestRes.data ?? []).map((r) => ({
          ...r,
          requested_percent: Math.round(Number(r.requested_rate ?? 0) * 10000) / 100,
          approved_percent:
            r.approved_rate == null ? null : Math.round(Number(r.approved_rate ?? 0) * 10000) / 100,
        })),
        gyms: gymsRes.data ?? [],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
