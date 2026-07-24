import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const UNPAID_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Vercel Cron: Flexy нэхэмжлэл үүсгээд эхний төлбөрөө 1 цагийн дотор
 * төлөөгүй багцуудыг автоматаар устгана (cascade → installment_payments).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - UNPAID_TTL_MS).toISOString();

  const { data: stalePlans, error: plansErr } = await supabase
    .from("installment_plans")
    .select("id")
    .eq("status", "active")
    .lt("created_at", cutoff);

  if (plansErr) {
    return NextResponse.json(
      { ok: false, error: plansErr.message },
      { status: 500 },
    );
  }

  const candidateIds = (stalePlans ?? []).map((p) => p.id as string);
  if (candidateIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, plan_ids: [] });
  }

  const { data: firstPayments, error: payErr } = await supabase
    .from("installment_payments")
    .select("plan_id, status")
    .eq("installment_no", 1)
    .in("plan_id", candidateIds);

  if (payErr) {
    return NextResponse.json(
      { ok: false, error: payErr.message },
      { status: 500 },
    );
  }

  const unpaidPlanIds = (firstPayments ?? [])
    .filter((row) => row.status !== "paid")
    .map((row) => row.plan_id as string);

  // Plans with no installment #1 row (corrupt) — also delete
  const paidOrKnown = new Set((firstPayments ?? []).map((r) => r.plan_id as string));
  const missingFirst = candidateIds.filter((id) => !paidOrKnown.has(id));
  const planIds = [...new Set([...unpaidPlanIds, ...missingFirst])];

  if (planIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, plan_ids: [] });
  }

  const { data: deleted, error: deleteErr } = await supabase
    .from("installment_plans")
    .delete()
    .in("id", planIds)
    .select("id");

  if (deleteErr) {
    return NextResponse.json(
      { ok: false, error: deleteErr.message, attempted: planIds.length },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: deleted?.length ?? 0,
    plan_ids: (deleted ?? []).map((r) => r.id),
  });
}
