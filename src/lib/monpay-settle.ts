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
  status?: string;
};

/** Mark booking paid + activate membership from a confirmed MonPay PAID invoice. */
export async function activateMonpayPaidBooking(
  supabase: SupabaseClient,
  opts: {
    invoiceId: string;
    bookingId?: string;
    userId?: string;
    amountFallback?: number | null;
  },
): Promise<{ booking_id: string; membership_activated: boolean }> {
  const invoice_id = String(opts.invoiceId).trim();
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
      let gross = opts.amountFallback ?? null;
      if (gross == null) {
        const { data: row } = await supabase
          .from("bookings")
          .select("amount")
          .eq("id", bookingId)
          .maybeSingle();
        const n = Number((row as { amount?: number } | null)?.amount);
        gross = Number.isFinite(n) && n > 0 ? n : null;
      }
      await recordSalesCommissionForPaidMembership(supabase, {
        buyerUserId: userId,
        bookingId,
        grossAmountFallback: gross,
      });
    } catch (e) {
      console.error("MonPay membership activation failed:", e);
    }
  }

  return { booking_id: bookingId, membership_activated };
}

/** Verify invoice via MonPay API then settle booking if PAID. */
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
      status: check.status,
    };
  }

  const activated = await activateMonpayPaidBooking(supabase, {
    invoiceId: invoice_id,
    bookingId: opts.bookingId,
    userId: opts.userId,
    amountFallback: check.invoice.amount ?? null,
  });

  return {
    paid: true,
    message: check.message || "Төлбөр амжилттай төлөгдлөө.",
    invoice_id,
    booking_id: activated.booking_id || opts.bookingId || undefined,
    membership_activated: activated.membership_activated,
    status: "PAID",
  };
}
