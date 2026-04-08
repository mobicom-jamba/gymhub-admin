import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!hasPermission(auth.permissions, "commissions.rate.approve")) {
      return NextResponse.json({ error: "Энэ хүсэлтийг шийдэх эрхгүй." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: "approve" | "reject";
      approved_rate?: number | string;
      review_note?: string;
    };
    const action = body.action;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action нь approve эсвэл reject байна." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: reqErr } = await supabase
      .from("sales_commission_requests")
      .select("id, sales_user_id, status, requested_rate")
      .eq("id", id)
      .maybeSingle();
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Хүсэлт олдсонгүй." }, { status: 404 });
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Шийдэгдсэн хүсэлт байна." }, { status: 409 });
    }

    const approvedRate =
      action === "approve"
        ? (() => {
            const n = Number(body.approved_rate ?? existing.requested_rate);
            return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
          })()
        : null;
    if (action === "approve" && approvedRate === null) {
      return NextResponse.json({ error: "approved_rate 0-1 хооронд байх ёстой." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const status = action === "approve" ? "approved" : "rejected";
    const patch = {
      status,
      approved_rate: approvedRate,
      review_note: typeof body.review_note === "string" ? body.review_note.trim() || null : null,
      reviewed_by: auth.userId,
      reviewed_at: now,
      updated_at: now,
    };
    const { data: updated, error: updateErr } = await supabase
      .from("sales_commission_requests")
      .update(patch)
      .eq("id", id)
      .select(
        "id, sales_user_id, requested_rate, approved_rate, status, note, review_note, reviewed_by, reviewed_at, created_at, updated_at",
      )
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (status === "approved" && approvedRate !== null) {
      await supabase
        .from("sales_promo_codes")
        .update({ commission_rate: approvedRate })
        .eq("sales_user_id", existing.sales_user_id)
        .eq("is_active", true);
    }

    return NextResponse.json({ row: updated });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
