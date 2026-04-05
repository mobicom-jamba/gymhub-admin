import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * POST { code } — нэвтэрсэн хэрэглэгчийн profiles.sales_referred_by тохируулна (нэг удаа).
 * Authorization: Bearer
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const code = String(body?.code ?? "")
      .trim()
      .toLowerCase();
    if (code.length < 2) {
      return NextResponse.json({ error: "Промо код оруулна уу" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("sales_referred_by, role")
      .eq("id", auth.userId)
      .maybeSingle();

    if (meErr) {
      return NextResponse.json({ error: meErr.message }, { status: 500 });
    }

    if (me?.sales_referred_by) {
      return NextResponse.json({ error: "Промо код аль хэдийн холбогдсон" }, { status: 400 });
    }

    const { data: rows, error: promoErr } = await supabase
      .from("sales_promo_codes")
      .select("sales_user_id")
      .eq("is_active", true)
      .eq("code", code)
      .limit(1);

    if (promoErr) {
      if (promoErr.code === "42P01") {
        return NextResponse.json({ error: "Системийн тохиргоо (sales_promo_codes) байхгүй" }, { status: 503 });
      }
      return NextResponse.json({ error: promoErr.message }, { status: 500 });
    }

    const salesUserId = rows?.[0]?.sales_user_id as string | undefined;
    if (!salesUserId) {
      return NextResponse.json({ error: "Промо код олдсонгүй" }, { status: 404 });
    }

    if (salesUserId === auth.userId) {
      return NextResponse.json({ error: "Өөрийн промо код ашиглах боломжгүй" }, { status: 400 });
    }

    const { error: upErr } = await supabase
      .from("profiles")
      .update({ sales_referred_by: salesUserId })
      .eq("id", auth.userId)
      .is("sales_referred_by", null);

    if (upErr) {
      if (upErr.code === "42703") {
        return NextResponse.json({ error: "profiles.sales_referred_by багана байхгүй — SQL ажиллуулна уу" }, { status: 503 });
      }
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
