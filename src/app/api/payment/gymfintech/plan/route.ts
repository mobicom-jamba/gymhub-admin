import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { normalizeQpayBankUrls } from "@/lib/qpay-bank-urls";
import { QPayError, buildSenderInvoiceNo, createQpayInvoice } from "@/lib/qpay-client";
import { buildInstallmentSchedule, maxInstallmentsForTier } from "@/lib/installment-schedule";

const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("gymfintech");
    if (blocked) return blocked;

    const body = await request.json();
    const { booking_id, plan_tier, total_amount, installment_count, user_id, description } = body as {
      booking_id: string;
      plan_tier: string;
      total_amount: number;
      installment_count: number;
      user_id: string;
      description?: string;
    };

    if (!booking_id || !plan_tier || !total_amount || total_amount <= 0 || !user_id) {
      return NextResponse.json(
        { error: "booking_id, plan_tier, total_amount, user_id шаардлагатай" },
        { status: 400 },
      );
    }
    const maxInstallments = maxInstallmentsForTier(plan_tier);
    if (!Number.isInteger(installment_count) || installment_count < 2 || installment_count > maxInstallments) {
      return NextResponse.json(
        { error: `installment_count 2-${maxInstallments} хооронд байх ёстой` },
        { status: 400 },
      );
    }

    const schedule = buildInstallmentSchedule({ totalAmount: total_amount, installmentCount: installment_count });
    if (schedule.some((item) => item.amount <= 0)) {
      return NextResponse.json(
        { error: "Энэ дүнг сонгосон хуваарийн тоонд хуваахад 0-тэй тэнцэх хуваарь үүснэ. Хуваарийн тоог багасгана уу." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: plan, error: planErr } = await supabase
      .from("installment_plans")
      .insert({
        user_id,
        booking_id,
        plan_tier,
        total_amount,
        installment_count,
        status: "active",
      })
      .select("id")
      .single();

    if (planErr || !plan) {
      return NextResponse.json(
        { error: `Flexy багц үүсгэхэд алдаа гарлаа: ${planErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    const { error: paymentsErr } = await supabase.from("installment_payments").insert(
      schedule.map((item) => ({
        plan_id: plan.id,
        installment_no: item.installment_no,
        amount: item.amount,
        due_date: item.due_date,
        status: "pending",
      })),
    );

    if (paymentsErr) {
      await supabase.from("installment_plans").delete().eq("id", plan.id);
      return NextResponse.json(
        { error: `Хуваарь үүсгэхэд алдаа гарлаа: ${paymentsErr.message}` },
        { status: 500 },
      );
    }

    const first = schedule[0];
    const senderInvoiceNo = buildSenderInvoiceNo(booking_id);
    const callbackUrl = new URL(QPAY_CALLBACK_URL);
    callbackUrl.searchParams.set("booking_id", booking_id);

    const invoice = await createQpayInvoice({
      senderInvoiceNo,
      receiverCode: user_id,
      description: description ?? `GymHub гишүүнчлэл — 1/${installment_count} хуваарь`,
      amount: first.amount,
      callbackUrl: callbackUrl.toString(),
    });

    const bankUrls = normalizeQpayBankUrls(invoice);

    await supabase
      .from("installment_payments")
      .update({
        qpay_invoice_id: String(invoice.invoice_id),
        qpay_qr_image: typeof invoice.qr_image === "string" ? invoice.qr_image : null,
        qpay_qr_text: typeof invoice.qr_text === "string" ? invoice.qr_text : null,
        qpay_bank_urls: bankUrls,
        status: "invoice_created",
      })
      .eq("plan_id", plan.id)
      .eq("installment_no", 1);

    return NextResponse.json({
      plan_id: plan.id,
      invoice_id: invoice.invoice_id,
      qr_image: invoice.qr_image,
      qr_text: invoice.qr_text,
      urls: bankUrls,
      schedule,
    });
  } catch (err: unknown) {
    if (err instanceof QPayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
