import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { normalizeQpayBankUrls } from "@/lib/qpay-bank-urls";
import { buildSenderInvoiceNo, createQpayInvoice } from "@/lib/qpay-client";

const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";
const LEAD_DAYS = 2;

/**
 * Vercel Cron: GymFinTech-ийн удахгүй болон хугацаа хэтэрсэн хуваарьт төлбөрийг боловсруулна.
 * - due_date <= now+2d, invoice үүсээгүй бол QPay нэхэмжлэл урьдчилан үүсгэнэ.
 * - due_date < today, төлөгдөөгүй бол 'overdue' гэж тэмдэглэнэ (админд харагдана, membership хаахгүй).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const leadDate = new Date(now.getTime() + LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);

  const results = { invoiced: 0, overdue: 0, errors: [] as string[] };

  const { data: due } = await supabase
    .from("installment_payments")
    .select("id, plan_id, installment_no, amount, due_date")
    .eq("status", "pending")
    .is("qpay_invoice_id", null)
    .lte("due_date", leadDate);

  for (const item of due ?? []) {
    try {
      const { data: plan } = await supabase
        .from("installment_plans")
        .select("id, booking_id, user_id")
        .eq("id", item.plan_id)
        .maybeSingle();
      if (!plan) continue;

      const senderInvoiceNo = buildSenderInvoiceNo(`${plan.booking_id}-inst${item.installment_no}`);
      const callbackUrl = new URL(QPAY_CALLBACK_URL);
      callbackUrl.searchParams.set("booking_id", plan.booking_id);

      const invoice = await createQpayInvoice({
        senderInvoiceNo,
        receiverCode: plan.user_id,
        description: `GymHub гишүүнчлэл — ${item.installment_no} дэх хуваарь`,
        amount: item.amount,
        callbackUrl: callbackUrl.toString(),
      });

      await supabase
        .from("installment_payments")
        .update({
          qpay_invoice_id: String(invoice.invoice_id),
          qpay_qr_image: typeof invoice.qr_image === "string" ? invoice.qr_image : null,
          qpay_qr_text: typeof invoice.qr_text === "string" ? invoice.qr_text : null,
          qpay_bank_urls: normalizeQpayBankUrls(invoice),
          status: "invoice_created",
        })
        .eq("id", item.id);

      results.invoiced++;
    } catch (e) {
      results.errors.push(`${item.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  const { data: overdueRows, error: overdueErr } = await supabase
    .from("installment_payments")
    .update({ status: "overdue" })
    .in("status", ["pending", "invoice_created"])
    .lt("due_date", todayStr)
    .select("id");

  if (!overdueErr) {
    results.overdue = overdueRows?.length ?? 0;
  }

  return NextResponse.json({ ok: true, ...results });
}
