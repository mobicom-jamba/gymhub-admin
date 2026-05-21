import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { isCarepayConfigured } from "@/lib/carepay";
import { settleCarepayPayment } from "@/lib/carepay-settle";

/**
 * POST /api/payment/carepay/check — Check Carepay invoice payment status
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("carepay");
    if (blocked) return blocked;

    if (!isCarepayConfigured()) {
      return NextResponse.json({ error: "Carepay тохиргоо дутуу" }, { status: 500 });
    }

    const body = await request.json();
    const { invoice_id, invoice_number, booking_id, user_id } = body as {
      invoice_id?: string;
      invoice_number?: string;
      booking_id?: string;
      user_id?: string;
    };

    const invoiceNumber = String(invoice_number ?? invoice_id ?? "").trim();
    if (!invoiceNumber) {
      return NextResponse.json({ error: "invoice_id шаардлагатай" }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
      const { checkInvoice } = await import("@/lib/carepay");
      const result = await checkInvoice(invoiceNumber);
      return NextResponse.json({
        paid: result.paid,
        message: result.message,
        invoice_id: invoiceNumber,
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const result = await settleCarepayPayment(supabase, {
      invoiceNumber,
      bookingId: booking_id,
      userId: user_id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Carepay check error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
