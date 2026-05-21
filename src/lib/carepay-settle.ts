import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInvoice } from "@/lib/carepay";
import {
  safeFindBookingIdByInvoice,
  safeUpdateBookingById,
} from "@/app/api/payment/_lib/bookings";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";

export type CarepaySettleResult = {
  paid: boolean;
  message: string;
  invoice_id: string;
  booking_id?: string;
  membership_activated?: boolean;
};

/** After Carepay reports paid: update booking + activate membership when possible. */
export async function settleCarepayPayment(
  supabase: SupabaseClient,
  opts: {
    invoiceNumber: string;
    bookingId?: string;
    userId?: string;
  },
): Promise<CarepaySettleResult> {
  const invoice_id = String(opts.invoiceNumber).trim();
  const check = await checkInvoice(invoice_id);

  if (!check.paid) {
    return {
      paid: false,
      message: check.message,
      invoice_id,
      booking_id: opts.bookingId,
    };
  }

  let bookingId = opts.bookingId?.trim() || "";
  let userId = opts.userId?.trim() || "";

  if (!bookingId) {
    bookingId = (await safeFindBookingIdByInvoice(supabase, invoice_id)) ?? "";
  }

  if (bookingId) {
    await safeUpdateBookingById(supabase, bookingId, {
      payment_status: "paid",
      payment_channel: "carepay",
      paid_at: new Date().toISOString(),
      qpay_invoice_id: invoice_id,
    });

    if (!userId) {
      const { data: row } = await supabase
        .from("bookings")
        .select("user_id")
        .eq("id", bookingId)
        .maybeSingle();
      userId = (row as { user_id?: string } | null)?.user_id?.trim() ?? "";
    }
  }

  let membership_activated = false;
  if (userId && bookingId.startsWith("membership-")) {
    try {
      membership_activated = await applyMembershipActivationForPaidBooking(supabase, {
        userId,
        bookingId,
      });
      await recordSalesCommissionForPaidMembership(supabase, {
        buyerUserId: userId,
        bookingId,
        grossAmountFallback: null,
      });
    } catch (e) {
      console.error("Carepay membership activation failed:", e);
    }
  }

  return {
    paid: true,
    message: check.message || "Төлбөр амжилттай төлөгдлөө.",
    invoice_id,
    booking_id: bookingId || undefined,
    membership_activated,
  };
}
