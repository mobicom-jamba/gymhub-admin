import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const QPAY_BASE = "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = process.env.QPAY_USERNAME!;
const QPAY_PASSWORD = process.env.QPAY_PASSWORD!;
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE!;
const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

// ─── in-memory token cache ───────────────────────────────────────────────────
let _token: string | null = null;
let _tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt) return _token;

  const basic = Buffer.from(`${QPAY_USERNAME}:${QPAY_PASSWORD}`).toString("base64");
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`QPay auth failed: ${res.status}`);
  const data = await res.json();
  _token = data.access_token as string;
  // QPay tokens are typically valid for 3600s; refresh 60s early
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return _token;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { booking_id, amount, description, user_id } = body as {
      booking_id: string;
      amount: number;
      description: string;
      user_id: string;
    };

    if (!booking_id || !amount) {
      return NextResponse.json({ error: "booking_id and amount required" }, { status: 400 });
    }

    const token = await getToken();

    const invoiceRes = await fetch(`${QPAY_BASE}/invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invoice_code: QPAY_INVOICE_CODE,
        sender_invoice_no: booking_id,
        invoice_receiver_code: user_id ?? "customer",
        invoice_description: description ?? `Захиалга #${booking_id}`,
        amount,
        callback_url: `${QPAY_CALLBACK_URL}?booking_id=${booking_id}`,
      }),
    });

    if (!invoiceRes.ok) {
      const errText = await invoiceRes.text();
      return NextResponse.json({ error: errText }, { status: invoiceRes.status });
    }

    const invoice = await invoiceRes.json();

    // Persist invoice_id → booking linkage in Supabase
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false },
      });
      await supabase.from("bookings").update({
        qpay_invoice_id: invoice.invoice_id,
        payment_status: "pending",
      }).eq("id", booking_id);
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
