import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/sales-promos
 * Бүх борлуулагчийн промо код + комиссын хувь (зөвхөн admin).
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: promos, error: pErr } = await admin
      .from("sales_promo_codes")
      .select("id, code, commission_rate, is_active, created_at, sales_user_id")
      .order("created_at", { ascending: false });

    if (pErr) {
      if (pErr.code === "42P01" || pErr.message?.includes("does not exist")) {
        return NextResponse.json(
          { ok: false, error: "sales_promo_codes хүснэгт байхгүй. sql/sales_role.sql ажиллуулна уу.", rows: [] },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }

    const list = promos ?? [];
    const ids = [...new Set(list.map((r) => r.sales_user_id).filter(Boolean))] as string[];

    let profileMap: Record<string, { full_name: string | null; phone: string | null; role: string | null }> =
      {};
    if (ids.length > 0) {
      const { data: profs, error: uErr } = await admin
        .from("profiles")
        .select("id, full_name, phone, role")
        .in("id", ids);
      if (!uErr && profs) {
        profileMap = Object.fromEntries(
          profs.map((p) => [
            p.id as string,
            {
              full_name: (p as { full_name?: string | null }).full_name ?? null,
              phone: (p as { phone?: string | null }).phone ?? null,
              role: (p as { role?: string | null }).role ?? null,
            },
          ]),
        );
      }
    }

    const rows = list.map((row) => {
      const sid = row.sales_user_id as string;
      const pr = profileMap[sid];
      return {
        id: row.id,
        code: row.code,
        commission_rate: Number(row.commission_rate),
        commission_percent: Math.round(Number(row.commission_rate) * 10000) / 100,
        is_active: row.is_active,
        created_at: row.created_at,
        sales_user_id: sid,
        sales_name: pr?.full_name ?? null,
        sales_phone: pr?.phone ?? null,
        sales_role: pr?.role ?? null,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
