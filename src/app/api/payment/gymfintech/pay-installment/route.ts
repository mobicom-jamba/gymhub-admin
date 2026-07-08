import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { normalizeQpayBankUrls } from "@/lib/qpay-bank-urls";
import { QPayError, buildSenderInvoiceNo, createQpayInvoice } from "@/lib/qpay-client";

const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("gymfintech");
    if (blocked) return blocked;

    const { plan_id, installment_no, user_id } = (await request.json()) as {
      plan_id: string;
      installment_no: number;
      user_id: string;
    };

    if (!plan_id || !installment_no || !user_id) {
      return NextResponse.json(
        { error: "plan_id, installment_no, user_id шаардлагатай" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: plan } = await supabase
      .from("installment_plans")
      .select("id, booking_id, user_id")
      .eq("id", plan_id)
      .maybeSingle();

    if (!plan || plan.user_id !== user_id) {
      return NextResponse.json({ error: "Багц олдсонгүй" }, { status: 404 });
    }

    const { data: installment } = await supabase
      .from("installment_payments")
      .select("id, amount, status, qpay_invoice_id, qpay_qr_image, qpay_qr_text, qpay_bank_urls")
      .eq("plan_id", plan_id)
      .eq("installment_no", installment_no)
      .maybeSingle();

    if (!installment) {
      return NextResponse.json({ error: "Хуваарь олдсонгүй" }, { status: 404 });
    }
    if (installment.status === "paid") {
      return NextResponse.json({ error: "Энэ хуваарь аль хэдийн төлөгдсөн байна" }, { status: 400 });
    }

    // Already has a live invoice — return the cached QR instead of creating a duplicate.
    if (installment.qpay_invoice_id) {
      return NextResponse.json({
        invoice_id: installment.qpay_invoice_id,
        qr_image: installment.qpay_qr_image,
        qr_text: installment.qpay_qr_text,
        urls: installment.qpay_bank_urls ?? [],
      });
    }

    const senderInvoiceNo = buildSenderInvoiceNo(`${plan.booking_id}-inst${installment_no}`);
    const callbackUrl = new URL(QPAY_CALLBACK_URL);
    callbackUrl.searchParams.set("booking_id", plan.booking_id);

    const invoice = await createQpayInvoice({
      senderInvoiceNo,
      receiverCode: user_id,
      description: `GymHub гишүүнчлэл — ${installment_no} дэх хуваарь`,
      amount: installment.amount,
      callbackUrl: callbackUrl.toString(),
    });

    const urls = normalizeQpayBankUrls(invoice);

    await supabase
      .from("installment_payments")
      .update({
        qpay_invoice_id: String(invoice.invoice_id),
        qpay_qr_image: typeof invoice.qr_image === "string" ? invoice.qr_image : null,
        qpay_qr_text: typeof invoice.qr_text === "string" ? invoice.qr_text : null,
        qpay_bank_urls: urls,
        status: "invoice_created",
      })
      .eq("id", installment.id);

    return NextResponse.json({
      invoice_id: invoice.invoice_id,
      qr_image: invoice.qr_image,
      qr_text: invoice.qr_text,
      urls,
    });
  } catch (err: unknown) {
    if (err instanceof QPayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
