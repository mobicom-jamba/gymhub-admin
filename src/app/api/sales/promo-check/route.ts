import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET ?code= — бүртгэлийн формонд зөвхөн буруу/зөв (ID задлахгүй) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("code")?.trim() ?? "";
    const code = raw.toLowerCase();
    if (code.length < 2) {
      return NextResponse.json({ ok: false });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sales_promo_codes")
      .select("id")
      .eq("is_active", true)
      .eq("code", code)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ ok: false, message: "Системийн тохиргоо дутуу" }, { status: 503 });
      }
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: Boolean(data) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
