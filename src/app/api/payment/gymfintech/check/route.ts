import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { QPayError, checkQpayInvoice } from "@/lib/qpay-client";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";

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

    // Админ гараар "төлөгдсөнд тэмдэглэсэн" эсвэл өмнөх шалгалтаас аль хэдийн paid болсон бол
    // QPay руу дахин хандахгүйгээр шууд paid буцаана (membership тухайн үед аль хэдийн идэвхжсэн).
    const { data: existing } = await supabase
      .from("installment_payments")
      .select("status")
      .eq("plan_id", plan_id)
      .eq("installment_no", installment_no)
      .maybeSingle();

    if (existing?.status === "paid") {
      return NextResponse.json({ paid: true, payment_status: "PAID", membership_activated: true });
    }

    const result = await checkQpayInvoice(invoice_id);
    let membershipActivated = false;

    if (result.paid) {
      const { data: plan } = await supabase
        .from("installment_plans")
        .select("id, booking_id, user_id, installment_count")
        .eq("id", plan_id)
        .maybeSingle();

      if (plan) {
        await supabase
          .from("installment_payments")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("plan_id", plan_id)
          .eq("installment_no", installment_no);

        if (installment_no === 1) {
          const uid = user_id || plan.user_id;
          try {
            membershipActivated = await applyMembershipActivationForPaidBooking(supabase, {
              userId: uid,
              bookingId: plan.booking_id,
            });
            const paidAmt =
              typeof result.paid_amount === "number" && result.paid_amount > 0
                ? result.paid_amount
                : null;
            await recordSalesCommissionForPaidMembership(supabase, {
              buyerUserId: uid,
              bookingId: plan.booking_id,
              grossAmountFallback: paidAmt,
            });
          } catch (e) {
            console.error("Flexy membership activation failed:", e);
          }
        }

        const { count: unpaidCount } = await supabase
          .from("installment_payments")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", plan_id)
          .neq("status", "paid");

        if ((unpaidCount ?? 0) === 0) {
          await supabase.from("installment_plans").update({ status: "completed" }).eq("id", plan_id);
        }
      }
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
