import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { normalizeQpayBankUrls } from "@/lib/qpay-bank-urls";
import { safeUpdateBookingById } from "../_lib/bookings";
import { QPayError, buildSenderInvoiceNo, createQpayInvoice } from "@/lib/qpay-client";

const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

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

    const senderInvoiceNo = buildSenderInvoiceNo(booking_id);
    const callbackUrl = new URL(QPAY_CALLBACK_URL);
    callbackUrl.searchParams.set("booking_id", booking_id);

    const invoice = await createQpayInvoice({
      senderInvoiceNo,
      receiverCode: user_id ?? "customer",
      description: description ?? `Захиалга #${booking_id}`,
      amount,
      callbackUrl: callbackUrl.toString(),
    });

    const bankUrls = normalizeQpayBankUrls(invoice);

    // Persist invoice_id → booking linkage in Supabase
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false },
      });
      const updateError = await safeUpdateBookingById(supabase, booking_id, {
        qpay_invoice_id: String(invoice.invoice_id),
        payment_status: "pending",
        payment_channel: "qpay",
        amount,
        ...(user_id ? { user_id } : {}),
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
      qr_image: invoice.qr_image, // base64 PNG
      qr_text: invoice.qr_text, // raw QR string
      urls: bankUrls,
    });
  } catch (err: unknown) {
    if (err instanceof QPayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
