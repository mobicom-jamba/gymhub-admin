import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/early-payments?kind=early_first|early_rest
 * Early 150k (эхний) / 330k (үлдэгдэл) төлсөн user_id жагсаалт.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin && !auth.isModerator && !auth.isSales) {
      return NextResponse.json({ error: "Хандах эрхгүй." }, { status: 403 });
    }

    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== "early_first" && kind !== "early_rest") {
      return NextResponse.json(
        { error: "kind=early_first|early_rest шаардлагатай" },
        { status: 400 },
      );
    }

    const prefix =
      kind === "early_first" ? "membership-early-first-" : "membership-early-rest-";

    const admin = createAdminClient();
    const userIds = new Set<string>();

    // Paginate — bookings can be large
    const PAGE = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("bookings")
        .select("user_id, id")
        .eq("payment_status", "paid")
        .like("id", `${prefix}%`)
        .not("user_id", "is", null)
        .range(from, from + PAGE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const row of data ?? []) {
        if (row.user_id) userIds.add(row.user_id as string);
      }

      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json({
      kind,
      userIds: Array.from(userIds),
      count: userIds.size,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
