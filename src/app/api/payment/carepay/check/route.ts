import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../../_lib/bookings";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { isCarepayConfigured, checkInvoice } from "@/lib/carepay";

/**
 * POST /api/payment/carepay/check — Check Carepay invoice payment status
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("carepay");
    if (blocked) return blocked;

    if (!isCarepayConfigured()) {
      return NextResponse.json({ error: "Carepay тохиргоо дутуу" }, { status: 500 });
    }

    const body = await request.json();
    const { invoice_id, booking_id, user_id } = body as {
      invoice_id?: string;
      booking_id?: string;
      user_id?: string;
    };

    const invoiceNumber = String(invoice_id ?? "").trim();
    if (!invoiceNumber) {
      return NextResponse.json({ error: "invoice_id шаардлагатай" }, { status: 400 });
    }

    const result = await checkInvoice(invoiceNumber);
    const paid = result.paid;

    if (paid) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          serviceKey,
          { auth: { persistSession: false } },
        );

        if (booking_id) {
          await safeUpdateBookingById(supabase, booking_id, {
            payment_status: "paid",
            payment_channel: "carepay",
            paid_at: new Date().toISOString(),
          });
        }

        if (user_id && booking_id?.startsWith("membership-")) {
          try {
            await applyMembershipActivationForPaidBooking(supabase, {
              userId: user_id,
              bookingId: booking_id,
            });
            await recordSalesCommissionForPaidMembership(supabase, {
              buyerUserId: user_id,
              bookingId: booking_id,
              grossAmountFallback: null,
            });
          } catch (e) {
            console.error("Carepay membership activation failed:", e);
          }
        }
      }
    }

    return NextResponse.json({
      paid,
      message: result.message,
      invoice_id: invoiceNumber,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Carepay check error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
