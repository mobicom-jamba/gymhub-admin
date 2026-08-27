import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { checkQpayInvoice } from "@/lib/qpay-client";
import { settleFlexyInstallmentPaid } from "@/lib/settle-flexy-payment";

const UNPAID_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Vercel Cron: Flexy нэхэмжлэл үүсгээд эхний төлбөрөө 1 цагийн дотор
 * төлөөгүй багцуудыг автоматаар устгана (cascade → installment_payments).
 *
 * Хэрэв QPay дээр аль хэдийн төлөгдсөн боловч callback/poll бүртгээгүй бол
 * устгахын оронд төлбөрийг settle хийнэ.
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
    return NextResponse.json({ ok: true, deleted: 0, settled: 0, skipped: 0, plan_ids: [] });
  }

  const { data: firstPayments, error: payErr } = await supabase
    .from("installment_payments")
    .select("plan_id, status, qpay_invoice_id")
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

  const paidOrKnown = new Set((firstPayments ?? []).map((r) => r.plan_id as string));
  const missingFirst = candidateIds.filter((id) => !paidOrKnown.has(id));

  const invoiceByPlan = new Map<string, string>();
  for (const row of firstPayments ?? []) {
    if (row.status === "paid") continue;
    const inv = String(row.qpay_invoice_id ?? "").trim();
    if (inv) invoiceByPlan.set(row.plan_id as string, inv);
  }

  const toDelete: string[] = [...missingFirst];
  let settled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const planId of unpaidPlanIds) {
    const invoiceId = invoiceByPlan.get(planId);
    if (!invoiceId) {
      toDelete.push(planId);
      continue;
    }
    try {
      const result = await checkQpayInvoice(invoiceId);
      if (result.paid) {
        await settleFlexyInstallmentPaid(supabase, {
          planId,
          installmentNo: 1,
          invoiceId,
          paidAmount:
            typeof result.paid_amount === "number" && result.paid_amount > 0
              ? result.paid_amount
              : null,
        });
        settled += 1;
        continue;
      }
      toDelete.push(planId);
    } catch (e) {
      skipped += 1;
      errors.push(`${planId}: ${e instanceof Error ? e.message : "qpay check failed"}`);
    }
  }

  const planIds = [...new Set(toDelete)];
  if (planIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: 0,
      settled,
      skipped,
      plan_ids: [],
      errors,
    });
  }

  const { data: deleted, error: deleteErr } = await supabase
    .from("installment_plans")
    .delete()
    .in("id", planIds)
    .select("id");

  if (deleteErr) {
    return NextResponse.json(
      { ok: false, error: deleteErr.message, attempted: planIds.length, settled, skipped },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: deleted?.length ?? 0,
    settled,
    skipped,
    plan_ids: (deleted ?? []).map((r) => r.id),
    errors,
  });
}
