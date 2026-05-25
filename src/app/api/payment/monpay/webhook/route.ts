import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isMonpayConfigured, verifyWebhookSignature } from "@/lib/monpay";
import { safeFindBookingIdByInvoice, safeUpdateBookingById } from "../../_lib/bookings";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";

/**
 * POST /api/payment/monpay/webhook — MonPay payment notification (invoice.paid / invoice.expired)
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    if (!isMonpayConfigured()) {
      return NextResponse.json({ error: "MonPay not configured" }, { status: 500 });
    }

    const signature =
      request.headers.get("x-monpay-signature") ??
      request.headers.get("X-MonPay-Signature");

    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const event =
      String(payload.event ?? request.headers.get("x-monpay-event") ?? "").trim() ||
      "invoice.paid";
    const data = (payload.data ?? payload) as Record<string, unknown>;
    const invoiceId = String(data.id ?? data.invoiceId ?? "").trim();
    const status = String(data.status ?? "").toUpperCase();

    if (!invoiceId) {
      return NextResponse.json({ received: true, ignored: true });
    }

    if (event === "invoice.expired" || status === "FAILED") {
      return NextResponse.json({ received: true, expired: true, invoice_id: invoiceId });
    }

    if (status && status !== "PAID" && event !== "invoice.paid") {
      return NextResponse.json({ received: true, pending: true, invoice_id: invoiceId });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ received: true, configured: false });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const bookingId = (await safeFindBookingIdByInvoice(supabase, invoiceId)) ?? "";

    // Webhook has no user access token — mark paid from payload when PAID; client check completes activation.
    if (status === "PAID" || event === "invoice.paid") {
      if (bookingId) {
        await safeUpdateBookingById(supabase, bookingId, {
          payment_status: "paid",
          payment_channel: "monpay",
          paid_at: new Date().toISOString(),
          qpay_invoice_id: invoiceId,
        });

        if (bookingId.startsWith("membership-")) {
          try {
            const { data: row } = await supabase
              .from("bookings")
              .select("user_id, amount")
              .eq("id", bookingId)
              .maybeSingle();
            const userId = (row as { user_id?: string } | null)?.user_id?.trim() ?? "";
            if (userId) {
              await applyMembershipActivationForPaidBooking(supabase, {
                userId,
                bookingId,
              });
              const gross = Number((row as { amount?: number } | null)?.amount);
              await recordSalesCommissionForPaidMembership(supabase, {
                buyerUserId: userId,
                bookingId,
                grossAmountFallback: Number.isFinite(gross) && gross > 0 ? gross : null,
              });
            }
          } catch (e) {
            console.error("MonPay webhook membership activation:", e);
          }
        }
      }
    }

    return NextResponse.json({
      received: true,
      paid: status === "PAID" || event === "invoice.paid",
      invoice_id: invoiceId,
      booking_id: bookingId || undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("MonPay webhook error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
