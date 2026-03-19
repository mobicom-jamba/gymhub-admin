import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const QPAY_BASE = "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = process.env.QPAY_USERNAME!;
const QPAY_PASSWORD = process.env.QPAY_PASSWORD!;

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
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return _token;
}

export async function POST(request: Request) {
  try {
    const { invoice_id, booking_id } = await request.json() as {
      invoice_id: string;
      booking_id?: string;
    };

    if (!invoice_id) {
      return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
    }

    const token = await getToken();

    const checkRes = await fetch(`${QPAY_BASE}/payment/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        object_type: "INVOICE",
        object_id: invoice_id,
      }),
    });

    if (!checkRes.ok) {
      const errText = await checkRes.text();
      return NextResponse.json({ error: errText }, { status: checkRes.status });
    }

    const result = await checkRes.json();
    const paid = result.payment_status === "PAID" ||
      (Array.isArray(result.rows) && result.rows.length > 0);

    // If paid and we have a booking_id, update Supabase
    if (paid && booking_id) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
          { auth: { persistSession: false } }
        );
        await supabase.from("bookings").update({
          payment_status: "paid",
          paid_at: new Date().toISOString(),
        }).eq("id", booking_id);
      }
    }

    return NextResponse.json({
      paid,
      payment_status: result.payment_status,
      rows: result.rows ?? [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
