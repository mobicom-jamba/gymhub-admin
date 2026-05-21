import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCarepayConfigured } from "@/lib/carepay";
import { settleCarepayPayment } from "@/lib/carepay-settle";
import { safeFindBookingIdByInvoice } from "../../_lib/bookings";

async function readCallbackInvoiceFromBody(request: Request): Promise<string> {
  try {
    const raw = await request.clone().text();
    if (!raw.trim()) return "";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const n =
      parsed.invoice_number ??
      parsed.invoice_id ??
      parsed.invoiceNumber ??
      parsed.invoiceId;
    return n != null ? String(n).trim() : "";
  } catch {
    return "";
  }
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const bookingIdParam = url.searchParams.get("booking_id")?.trim() ?? "";
    const bodyInvoice = await readCallbackInvoiceFromBody(request);
    const invoiceParam =
      url.searchParams.get("invoice_number")?.trim() ||
      url.searchParams.get("invoice_id")?.trim() ||
      bodyInvoice;

    if (!bookingIdParam && !invoiceParam) {
      return NextResponse.json({ received: true, ignored: true });
    }

    if (!isCarepayConfigured()) {
      return NextResponse.json({ error: "Carepay not configured" }, { status: 500 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    let invoiceNumber = invoiceParam;
    let bookingId = bookingIdParam;

    if (!invoiceNumber && bookingId) {
      const { data: row } = await supabase
        .from("bookings")
        .select("qpay_invoice_id")
        .eq("id", bookingId)
        .maybeSingle();
      invoiceNumber = (row as { qpay_invoice_id?: string } | null)?.qpay_invoice_id?.trim() ?? "";
    }

    if (!bookingId && invoiceNumber) {
      bookingId = (await safeFindBookingIdByInvoice(supabase, invoiceNumber)) ?? "";
    }

    if (!invoiceNumber) {
      return NextResponse.json({ received: true, pending: true, reason: "no_invoice" });
    }

    const result = await settleCarepayPayment(supabase, {
      invoiceNumber,
      bookingId: bookingId || undefined,
    });

    return NextResponse.json({
      received: true,
      paid: result.paid,
      booking_id: result.booking_id ?? bookingId,
      invoice_id: result.invoice_id,
      membership_activated: result.membership_activated,
      message: result.message,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Carepay callback error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
