import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeUpdateBookingById } from "../../_lib/bookings";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";

/**
 * POST /api/payment/pocket/webhook — Receive Pocket payment webhook notifications
 *
 * Pocket sends this payload when an invoice is paid/cancelled/rejected:
 * {
 *   "id": "transaction ID",
 *   "amount": "amount",
 *   "info": "info string",
 *   "invoiceId": "pocket invoice ID",
 *   "invoiceState": 20,  // 10=pending, 20=paid, 30=cancelled, 40=rejected, 50=unsuccess, 60=processing, 70=processed
 *   "heldId": "hold ID",
 *   "phoneNumber": "payer phone",
 *   "orderNumber": "our booking_id"
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      id: transactionId,
      amount,
      invoiceId,
      invoiceState,
      phoneNumber,
      orderNumber,
      info,
    } = body as {
      id?: string;
      amount?: number;
      info?: string;
      invoiceId?: number;
      invoiceState?: number;
      heldId?: string;
      phoneNumber?: string;
      orderNumber?: string;
    };

    console.log("Pocket webhook received:", JSON.stringify(body));

    // invoiceState 20 = paid
    const paid = invoiceState === 20;
    const fromInfo =
      typeof info === "string"
        ? // Expected format from POST /api/payment/pocket:
          // "... GHBID:<alnum-hyphen>"
          info.match(/\bGHBID:([a-zA-Z0-9-]{6,80})\b/)?.[1]?.trim()
        : undefined;
    const bookingId = fromInfo || orderNumber;

    if (!bookingId) {
      console.warn("Pocket webhook: no booking id (info tag or orderNumber)");
      return NextResponse.json({ received: true });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error("Pocket webhook: Supabase not configured");
      return NextResponse.json({ received: true });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
      { auth: { persistSession: false } },
    );

    if (paid) {
      // Update booking
      await safeUpdateBookingById(supabase, bookingId, {
        payment_status: "paid",
        payment_channel: "pocket",
        paid_at: new Date().toISOString(),
      });

      // Activate membership if this is a membership payment
      if (bookingId.startsWith("membership-")) {
        try {
          // Find user_id from booking or profile by phone
          let userId: string | null = null;

          // Try to find by booking
          const { data: booking } = await supabase
            .from("bookings")
            .select("user_id")
            .eq("id", bookingId)
            .maybeSingle();

          if (booking?.user_id) {
            userId = booking.user_id;
          } else if (phoneNumber) {
            // Fallback: find user by phone number
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("phone", phoneNumber.replace(/\D/g, ""))
              .maybeSingle();
            if (profile?.id) userId = profile.id;
          }

          if (userId) {
            await applyMembershipActivationForPaidBooking(supabase, {
              userId,
              bookingId,
            });
            const gross =
              typeof amount === "number" && amount > 0 ? amount : null;
            await recordSalesCommissionForPaidMembership(supabase, {
              buyerUserId: userId,
              bookingId,
              grossAmountFallback: gross,
            });

            console.log(`Pocket webhook: membership activation attempted for user ${userId}`);
          }
        } catch (e) {
          console.error("Pocket webhook membership activation error:", e);
        }
      }
    } else {
      // Non-paid states: cancelled, rejected, etc.
      const stateMap: Record<number, string> = {
        10: "pending",
        30: "cancelled",
        40: "rejected",
        50: "failed",
        60: "processing",
        70: "processed",
      };
      const statusLabel = stateMap[invoiceState ?? 0] ?? "unknown";
      await safeUpdateBookingById(supabase, bookingId, {
        payment_status: statusLabel,
      });
      console.log(`Pocket webhook: booking ${bookingId} -> ${statusLabel} (state=${invoiceState})`);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("Pocket webhook error:", err instanceof Error ? err.message : err);
    // Always return 200 to Pocket so it doesn't retry endlessly
    return NextResponse.json({ received: true });
  }
}
