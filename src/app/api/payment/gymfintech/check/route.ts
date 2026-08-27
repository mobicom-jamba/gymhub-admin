import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { QPayError, checkQpayInvoice } from "@/lib/qpay-client";
import { settleFlexyInstallmentPaid } from "@/lib/settle-flexy-payment";

export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("gymfintech");
    if (blocked) return blocked;

    const { plan_id, installment_no, invoice_id, user_id } = (await request.json()) as {
      plan_id: string;
      installment_no: number;
      invoice_id: string;
      user_id?: string;
    };

    if (!plan_id || !installment_no || !invoice_id) {
      return NextResponse.json(
        { error: "plan_id, installment_no, invoice_id шаардлагатай" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("installment_payments")
      .select("status")
      .eq("plan_id", plan_id)
      .eq("installment_no", installment_no)
      .maybeSingle();

    if (existing?.status === "paid") {
      const settled = await settleFlexyInstallmentPaid(supabase, {
        planId: plan_id,
        installmentNo: installment_no,
        invoiceId: invoice_id,
        userId: user_id,
      });
      return NextResponse.json({
        paid: true,
        payment_status: "PAID",
        membership_activated: settled.membershipActivated,
      });
    }

    const result = await checkQpayInvoice(invoice_id);
    let membershipActivated = false;

    if (result.paid) {
      const settled = await settleFlexyInstallmentPaid(supabase, {
        planId: plan_id,
        installmentNo: installment_no,
        invoiceId: invoice_id,
        userId: user_id,
        paidAmount:
          typeof result.paid_amount === "number" && result.paid_amount > 0
            ? result.paid_amount
            : null,
      });
      membershipActivated = settled.membershipActivated;
    }

    return NextResponse.json({
      paid: result.paid,
      payment_status: result.payment_status,
      membership_activated: membershipActivated,
    });
  } catch (err: unknown) {
    if (err instanceof QPayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
