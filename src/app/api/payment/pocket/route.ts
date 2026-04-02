import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import {
  isPocketConfigured,
  createInvoice,
  generateQrImage,
} from "@/lib/pocket";

/**
 * POST /api/payment/pocket — Create a Pocket Payment Gateway invoice
 * Returns QR code image (base64), deeplink, and invoice details for polling.
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("pocket");
    if (blocked) return blocked;

    if (!isPocketConfigured()) {
      return NextResponse.json(
        { error: "Pocket төлбөрийн тохиргоо хийгдээгүй байна." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { booking_id, amount, description, user_id } = body as {
      booking_id: string;
      amount: number;
      description?: string;
      user_id: string;
    };

    if (!booking_id || !amount || !user_id) {
      return NextResponse.json(
        { error: "booking_id, amount, user_id шаардлагатай" },
        { status: 400 },
      );
    }

    // Use booking_id as the unique order number
    const orderNumber = booking_id;

    // Create real Pocket invoice
    const pocketRes = await createInvoice({
      amount,
      orderNumber,
      info: description ?? `GymHub гишүүнчлэл - ${orderNumber}`,
      invoiceType: "ZERO",
      channel: "ecommerce",
    });

    // Generate QR code image from the Pocket QR payload
    const qrImageBase64 = await generateQrImage(pocketRes.qr);

    // Track booking in Supabase
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceKey,
        { auth: { persistSession: false } },
      );

      await safeUpdateBookingById(supabase, booking_id, {
        payment_channel: "pocket",
        payment_status: "pending",
        amount,
      });
    }

    // Return response compatible with both web and mobile frontends
    return NextResponse.json({
      success: true,
      invoice_id: String(pocketRes.id),
      id: String(pocketRes.id),
      order_number: pocketRes.orderNumber,
      qr_image: qrImageBase64,
      qr_string: qrImageBase64,
      deeplink: pocketRes.deeplink,
      channel: "pocket",
      status: "pending",
      message: "Pocket апп-аар QR уншуулж төлнө үү",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Pocket invoice error:", msg);
    return NextResponse.json(
      { error: "Pocket нэхэмжлэл үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." },
      { status: 500 },
    );
  }
}
