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

    // Pocket API limits orderNumber to 25 chars max.
    // Same booking_id twice → Pocket returns "order_number already exists"; retry with a short unique suffix.
    const buildOrderNumber = (suffix: string): string => {
      const sep = "-";
      const max = 25;
      const s = suffix.slice(0, 6);
      const room = max - sep.length - s.length;
      const base = booking_id.slice(0, Math.max(1, room));
      return (base + sep + s).slice(0, max);
    };

    let pocketRes: Awaited<ReturnType<typeof createInvoice>> | undefined;
    const primaryOrder =
      booking_id.length > 25 ? booking_id.slice(0, 25) : booking_id;
    const maxAttempts = 4;

    // Webhook must resolve the real booking id when Pocket orderNumber is truncated or uniquified.
    const infoPayload = `${description ?? `GymHub - ${booking_id}`} [GHBID:${booking_id}]`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const orderNumber =
        attempt === 0
          ? primaryOrder
          : buildOrderNumber(
              `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
            );

      try {
        pocketRes = await createInvoice({
          amount,
          orderNumber,
          info: infoPayload,
          invoiceType: "ZERO",
          channel: "ecommerce",
        });
        break;
      } catch (e) {
        const lastErr = e instanceof Error ? e : new Error(String(e));
        const msg = lastErr.message.toLowerCase();
        const duplicateOrder =
          msg.includes("already exists") || msg.includes("duplicate");
        if (!duplicateOrder || attempt === maxAttempts - 1) {
          throw lastErr;
        }
      }
    }

    if (!pocketRes) {
      throw new Error("Pocket invoice failed");
    }

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
      { error: msg || "Pocket нэхэмжлэл үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." },
      { status: 500 },
    );
  }
}
