import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeFindBookingIdByInvoice, safeUpdateBookingById } from "../_lib/bookings";

async function handleCallback(request: Request) {
  try {
    const rawBody = await request.text();
    let payload: Record<string, unknown> = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }

    const url = new URL(request.url);
    const bookingId = url.searchParams.get("booking_id");
    const invoiceId =
      (payload.invoice_id as string | undefined) ??
      (payload.object_id as string | undefined) ??
      null;
    const paymentStatus = (payload.payment_status as string | undefined)?.toUpperCase();

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      { auth: { persistSession: false } }
    );

    let resolvedBookingId = bookingId;
    if (!resolvedBookingId && invoiceId) {
      resolvedBookingId = await safeFindBookingIdByInvoice(supabase, invoiceId);
    }

    if (resolvedBookingId && (!paymentStatus || paymentStatus === "PAID")) {
      const updateError = await safeUpdateBookingById(supabase, resolvedBookingId, {
        payment_status: "paid",
        payment_channel: "qpay",
        paid_at: new Date().toISOString(),
      });
      if (updateError) {
        return NextResponse.json({ error: updateError }, { status: 500 });
      }
    }

    return NextResponse.json({
      received: true,
      booking_id: resolvedBookingId,
      invoice_id: invoiceId,
      payment_status: paymentStatus ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleCallback(request);
}

export async function GET(request: Request) {
  return handleCallback(request);
}
