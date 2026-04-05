import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";
import { getTodayStartUTC8 } from "@/lib/gym-daily-capacity";

/**
 * POST /api/admin/reset-user-daily-checkin
 * Body: { user_id: string }
 * Устгаж өгөх: тухайн хэрэглэгчийн өнөөдрийн (UTC+8) бүх gym_visits — дахин фитнес рүү орох «өдөрт 1» лимит цэвэрлэгдэнэ.
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const body = (await request.json()) as { user_id?: string };
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) {
      return NextResponse.json({ error: "user_id шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const todayStart = getTodayStartUTC8();

    const { data: rows, error: selErr } = await supabase
      .from("gym_visits")
      .select("id")
      .eq("user_id", userId)
      .gte("checked_in_at", todayStart);

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const ids = (rows ?? []).map((r) => r.id).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const { error: delErr } = await supabase.from("gym_visits").delete().in("id", ids);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
