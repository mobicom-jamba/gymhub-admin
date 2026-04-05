import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireSalesOrAdmin } from "@/lib/verify-sales-access";

/** GET — өөрийн промо код, комиссын нийлбэр, сүүлийн гүйлгээнүүд */
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

    const { data: promos, error: pErr } = await supabase
      .from("sales_promo_codes")
      .select("code, commission_rate, is_active, created_at")
      .eq("sales_user_id", targetSalesId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (pErr && pErr.code !== "42P01") {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const { data: sumRows, error: sErr } = await supabase
      .from("sales_commissions")
      .select("commission_amount")
      .eq("sales_user_id", targetSalesId);

    if (sErr && sErr.code !== "42P01") {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const totalCommission = (sumRows ?? []).reduce(
      (acc, r) => acc + (Number((r as { commission_amount?: unknown }).commission_amount) || 0),
      0,
    );

    const { data: recent, error: rErr } = await supabase
      .from("sales_commissions")
      .select("booking_id, gross_amount, commission_amount, commission_rate, created_at, buyer_user_id")
      .eq("sales_user_id", targetSalesId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (rErr && rErr.code !== "42P01") {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, role")
      .eq("id", targetSalesId)
      .maybeSingle();

    return NextResponse.json({
      profile: profile ?? null,
      promo_codes: promos ?? [],
      commission_total: Math.round(totalCommission * 100) / 100,
      commission_count: sumRows?.length ?? 0,
      recent_commissions: recent ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
