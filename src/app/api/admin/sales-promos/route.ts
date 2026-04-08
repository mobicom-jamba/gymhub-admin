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

    const [{ data: promos, error: pErr }, { data: requests, error: rErr }] = await Promise.all([
      admin
        .from("sales_promo_codes")
        .select("id, code, commission_rate, is_active, created_at, sales_user_id")
        .order("created_at", { ascending: false }),
      admin
        .from("sales_commission_requests")
        .select("id, sales_user_id, requested_rate, approved_rate, status, note, review_note, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

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

    const pendingRequests = (requests ?? [])
      .filter((r) => r.status === "pending")
      .map((r) => {
        const profile = profileMap[r.sales_user_id as string];
        const requestedRate = Number(r.requested_rate);
        return {
          id: r.id,
          sales_user_id: r.sales_user_id,
          sales_name: profile?.full_name ?? null,
          sales_phone: profile?.phone ?? null,
          requested_rate: requestedRate,
          requested_percent: Math.round(requestedRate * 10000) / 100,
          note: r.note ?? null,
          created_at: r.created_at,
        };
      });
    if (rErr && rErr.code !== "42P01") {
      return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows, pending_requests: pendingRequests });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
