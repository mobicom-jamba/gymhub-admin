import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInvoice } from "@/lib/monpay";
import {
  safeFindBookingIdByInvoice,
  safeUpdateBookingById,
} from "@/app/api/payment/_lib/bookings";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";

export type MonpaySettleResult = {
  paid: boolean;
  message: string;
  invoice_id: string;
  booking_id?: string;
  membership_activated?: boolean;
};

export async function settleMonpayPayment(
  supabase: SupabaseClient,
  opts: {
    invoiceId: string;
    accessToken: string;
    bookingId?: string;
    userId?: string;
  },
): Promise<MonpaySettleResult> {
  const invoice_id = String(opts.invoiceId).trim();
  const check = await checkInvoice(opts.accessToken, invoice_id);

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
      payment_channel: "monpay",
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
        grossAmountFallback: check.invoice.amount ?? null,
      });
    } catch (e) {
      console.error("MonPay membership activation failed:", e);
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
