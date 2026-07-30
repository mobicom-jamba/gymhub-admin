import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isMonpayConfigured, verifyWebhookSignature } from "@/lib/monpay";
import { activateMonpayPaidBooking } from "@/lib/monpay-settle";

/**
 * POST /api/payment/monpay/webhook
 * MonPay payment notification (invoice.paid / invoice.expired).
 * Verifies X-MonPay-Signature (HMAC-SHA256). Returns 200 OK on success.
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

    const eventHeader = request.headers.get("x-monpay-event") ?? "";
    const event =
      String(payload.event ?? eventHeader ?? "").trim() || "invoice.paid";
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

    const amountRaw = Number(data.amount);
    const activated = await activateMonpayPaidBooking(supabase, {
      invoiceId,
      amountFallback: Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null,
    });

    return NextResponse.json({
      received: true,
      paid: true,
      invoice_id: invoiceId,
      booking_id: activated.booking_id || undefined,
      membership_activated: activated.membership_activated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("MonPay webhook error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
