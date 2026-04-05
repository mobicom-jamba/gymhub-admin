import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

/** PUT { code, commission_rate? } — зөвхөн role=sales */
export async function PUT(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (auth.isAdmin) {
      return NextResponse.json({ error: "Промо кодыг зөвхөн борлуулалтын ажилтан өөрөө тохируулна" }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data: prof, error: pe } = await supabase.from("profiles").select("role").eq("id", auth.userId).maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
    if (prof?.role !== "sales") {
      return NextResponse.json({ error: "Борлуулалтын эрх шаардлагатай" }, { status: 403 });
    }

    const body = await request.json();
    const code = normalizeCode(String(body?.code ?? ""));
    if (code.length < 4 || code.length > 40) {
      return NextResponse.json({ error: "Код 4–40 тэмдэгт (латин үсэг, тоо, _, -)" }, { status: 400 });
    }

    let rate = 0.05;
    if (body?.commission_rate != null) {
      const n = Number(body.commission_rate);
      if (Number.isFinite(n) && n > 0 && n <= 1) rate = n;
    }

    await supabase
      .from("sales_promo_codes")
      .update({ is_active: false })
      .eq("sales_user_id", auth.userId)
      .eq("is_active", true);

    const { data: inserted, error: insErr } = await supabase
      .from("sales_promo_codes")
      .insert({
        code,
        sales_user_id: auth.userId,
        commission_rate: rate,
        is_active: true,
      })
      .select("id, code, commission_rate, is_active")
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "Энэ кодыг өөр хэрэглэгч ашиглаж байна" }, { status: 409 });
      }
      if (insErr.code === "42P01") {
        return NextResponse.json({ error: "sales_promo_codes хүснэгт байхгүй — SQL ажиллуулна уу" }, { status: 503 });
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, promo: inserted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
