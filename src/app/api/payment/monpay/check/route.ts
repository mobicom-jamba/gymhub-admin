import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { isMonpayConfigured } from "@/lib/monpay";
import { settleMonpayPayment } from "@/lib/monpay-settle";

/**
 * POST /api/payment/monpay/check — Check MonPay invoice status
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("monpay");
    if (blocked) return blocked;

    if (!isMonpayConfigured()) {
      return NextResponse.json({ error: "MonPay тохиргоо дутуу" }, { status: 500 });
    }

    const body = await request.json();
    const { invoice_id, booking_id, user_id, access_token } = body as {
      invoice_id?: string;
      booking_id?: string;
      user_id?: string;
      access_token?: string;
    };

    const invoiceId = String(invoice_id ?? "").trim();
    const token = String(access_token ?? "").trim();
    if (!invoiceId) {
      return NextResponse.json({ error: "invoice_id шаардлагатай" }, { status: 400 });
    }
    if (!token) {
      return NextResponse.json({ error: "access_token шаардлагатай" }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
      const { checkInvoice } = await import("@/lib/monpay");
      const result = await checkInvoice(token, invoiceId);
      return NextResponse.json({
        paid: result.paid,
        message: result.message,
        invoice_id: invoiceId,
        status: result.status,
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const result = await settleMonpayPayment(supabase, {
      invoiceId,
      accessToken: token,
      bookingId: booking_id,
      userId: user_id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("MonPay check error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
