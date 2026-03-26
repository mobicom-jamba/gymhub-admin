import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";

const QPAY_BASE = process.env.QPAY_BASE_URL ?? "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = process.env.QPAY_CLIENT_ID ?? process.env.QPAY_USERNAME ?? "";
const QPAY_PASSWORD = process.env.QPAY_CLIENT_SECRET ?? process.env.QPAY_PASSWORD ?? "";
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE ?? "";
const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

// ─── in-memory token cache ───────────────────────────────────────────────────
let _token: string | null = null;
let _tokenExpiresAt = 0;

function buildSenderInvoiceNo(bookingId: string): string {
  // QPay sender_invoice_no max length is 45 chars.
  // Keep it deterministic-ish and unique per request.
  const ts = Date.now().toString();
  const safeBooking = bookingId.replace(/[^a-zA-Z0-9_-]/g, "");
  const maxBookingLen = Math.max(1, 45 - 1 - ts.length);
  const compactBooking = safeBooking.slice(0, maxBookingLen);
  return `${compactBooking}-${ts}`;
}

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt) return _token;

  if (!QPAY_USERNAME || !QPAY_PASSWORD) {
    throw new Error("QPay credentials are not configured");
  }

  const basic = Buffer.from(`${QPAY_USERNAME}:${QPAY_PASSWORD}`).toString("base64");
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    throw new Error(`QPay auth failed (${res.status})`);
  }
  const data = await res.json();
  _token = data.access_token as string;
  // QPay tokens are typically valid for 3600s; refresh 60s early
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return _token;
}

export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("qpay");
    if (blocked) return blocked;

    const body = await request.json();
    const { booking_id, amount, description, user_id } = body as {
      booking_id: string;
      amount: number;
      description: string;
      user_id: string;
    };

    if (!booking_id || !amount || amount <= 0) {
      return NextResponse.json({ error: "booking_id болон amount (0-с их) шаардлагатай" }, { status: 400 });
    }
    if (!QPAY_INVOICE_CODE) {
      return NextResponse.json(
        { error: "QPAY_INVOICE_CODE тохируулагдаагүй байна" },
        { status: 500 },
      );
    }

    const token = await getToken();
    const senderInvoiceNo = buildSenderInvoiceNo(booking_id);
    const callbackUrl = new URL(QPAY_CALLBACK_URL);
    callbackUrl.searchParams.set("booking_id", booking_id);

    const invoiceRes = await fetch(`${QPAY_BASE}/invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invoice_code: QPAY_INVOICE_CODE,
        sender_invoice_no: senderInvoiceNo,
        invoice_receiver_code: user_id ?? "customer",
        invoice_description: description ?? `Захиалга #${booking_id}`,
        amount,
        callback_url: callbackUrl.toString(),
      }),
    });

    if (!invoiceRes.ok) {
      const errText = await invoiceRes.text();
      return NextResponse.json(
        { error: `QPay invoice үүсгэхэд алдаа гарлаа: ${errText || invoiceRes.status}` },
        { status: invoiceRes.status },
      );
    }

    const invoice = await invoiceRes.json();
    if (!invoice?.invoice_id) {
      return NextResponse.json(
        { error: "QPay-с invoice_id буцаагдсангүй" },
        { status: 502 },
      );
    }

    // Persist invoice_id → booking linkage in Supabase
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false },
      });
      const updateError = await safeUpdateBookingById(supabase, booking_id, {
        qpay_invoice_id: invoice.invoice_id,
        payment_status: "pending",
      });
      if (updateError) {
        return NextResponse.json(
          { error: `Booking шинэчлэхэд алдаа гарлаа: ${updateError}` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      invoice_id: invoice.invoice_id,
      qr_image: invoice.qr_image,        // base64 PNG
      qr_text: invoice.qr_text,          // raw QR string
      urls: invoice.urls ?? [],           // bank deeplinks
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
