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
    const { data, error } = await admin.rpc("paid_booking_user_ids_by_id_prefix", {
      p_prefix: prefix,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = [
      ...new Set(
        (data ?? [])
          .map((row) => String((row as { user_id?: string }).user_id ?? "").trim())
          .filter(Boolean),
      ),
    ];

    return NextResponse.json({
      kind,
      userIds,
      count: userIds.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
