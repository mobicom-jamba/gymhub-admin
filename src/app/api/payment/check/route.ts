import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { QPayError, checkQpayInvoice } from "@/lib/qpay-client";

export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("qpay");
    if (blocked) return blocked;

    const { invoice_id, booking_id, user_id } = await request.json() as {
      invoice_id: string;
      booking_id?: string;
      user_id?: string;
    };

    if (!invoice_id) {
      return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
    }

    const result = await checkQpayInvoice(invoice_id);
    const { paid, rows } = result;

    // If paid, update Supabase
    let membershipActivated = false;
    if (paid) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
          { auth: { persistSession: false } }
        );

        // Update booking status
        if (booking_id) {
          await safeUpdateBookingById(supabase, booking_id, {
            payment_status: "paid",
            payment_channel: "qpay",
            paid_at: new Date().toISOString(),
            ...(user_id ? { user_id } : {}),
          });
        }

        if (user_id && booking_id?.startsWith("membership-")) {
          try {
            membershipActivated = await applyMembershipActivationForPaidBooking(supabase, {
              userId: user_id,
              bookingId: booking_id,
            });
            const paidAmt =
              typeof result.paid_amount === "number" && result.paid_amount > 0
                ? result.paid_amount
                : null;
            await recordSalesCommissionForPaidMembership(supabase, {
              buyerUserId: user_id,
              bookingId: booking_id,
              grossAmountFallback: paidAmt,
            });
          } catch (e) {
            console.error("Server-side membership activation failed:", e);
          }
        }
      }
    }

    return NextResponse.json({
      paid,
      payment_status: result.payment_status,
      count: result.count ?? rows.length,
      paid_amount: result.paid_amount ?? 0,
      rows,
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
