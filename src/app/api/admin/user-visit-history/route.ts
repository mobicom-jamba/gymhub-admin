import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/user-visit-history?user_id=xxx
 * Returns per-month visit breakdown for one user (admin only).
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "user_id шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("gym_visits")
      .select("checked_in_at, gym_name, status")
      .eq("user_id", userId)
      .neq("status", "rejected")
      .order("checked_in_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ visits: data ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
