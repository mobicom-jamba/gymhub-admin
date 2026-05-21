import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import {
  isCarepayConfigured,
  normalizeCarepayPhone,
  createQrInvoice,
  generateQrImage,
} from "@/lib/carepay";

const DEFAULT_CALLBACK =
  process.env.CAREPAY_CALLBACK_URL ??
  `${process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/payment/carepay/callback`;

/**
 * POST /api/payment/carepay — Create Carepay QR invoice
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("carepay");
    if (blocked) return blocked;

    if (!isCarepayConfigured()) {
      return NextResponse.json(
        { error: "Carepay төлбөрийн тохиргоо хийгдээгүй байна." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { booking_id, amount, user_id, phone } = body as {
      booking_id: string;
      amount: number;
      user_id: string;
      phone?: string;
    };

    if (!booking_id || amount == null || !user_id) {
      return NextResponse.json(
        { error: "booking_id, amount, user_id шаардлагатай" },
        { status: 400 },
      );
    }

    if (!phone || !String(phone).trim()) {
      return NextResponse.json(
        { error: "Carepay-д утасны дугаар шаардлагатай" },
        { status: 400 },
      );
    }

    const amountMnt = Math.round(Number(amount));
    if (!Number.isFinite(amountMnt) || amountMnt < 1) {
      return NextResponse.json({ error: "amount тоо байх ёстой" }, { status: 400 });
    }

    let phoneNum: number;
    try {
      phoneNum = normalizeCarepayPhone(String(phone));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Буруу утасны дугаар";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const callbackUrl = new URL(DEFAULT_CALLBACK);
    callbackUrl.searchParams.set("booking_id", booking_id);

    const invoice = await createQrInvoice({
      phone: phoneNum,
      price: amountMnt,
      callbackUrl: callbackUrl.toString(),
    });

    const qrImageBase64 = await generateQrImage(invoice.encrypted);

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceKey,
        { auth: { persistSession: false } },
      );

      await safeUpdateBookingById(supabase, booking_id, {
        payment_channel: "carepay",
        payment_status: "pending",
        qpay_invoice_id: invoice.invoice_number,
        amount: amountMnt,
      });
    }

    return NextResponse.json({
      success: true,
      invoice_id: invoice.invoice_number,
      id: invoice.invoice_number,
      invoice_number: invoice.invoice_number,
      qr_image: qrImageBase64,
      qr_string: qrImageBase64,
      channel: "carepay",
      status: "pending",
      message: "Carepay апп-аар QR уншуулж төлнө үү",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Carepay invoice error:", msg);
    return NextResponse.json(
      { error: msg || "Carepay нэхэмжлэл үүсгэхэд алдаа гарлаа." },
      { status: 500 },
    );
  }
}
