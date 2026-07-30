import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import {
  createInvoice,
  getMonpayReceiver,
  getMonpayRedirectUri,
  isMonpayConfigured,
  resolveMonpayWebhookUrl,
} from "@/lib/monpay";

/**
 * POST /api/payment/monpay — Create MonPay P2B invoice (mini-app user token required)
 *
 * redirectUri      = MONPAY_REDIRECT_URI (registered return URL)
 * clientServiceUrl = MONPAY_WEBHOOK_URL (server payment webhook)
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("monpay");
    if (blocked) return blocked;

    if (!isMonpayConfigured()) {
      return NextResponse.json(
        { error: "MonPay төлбөрийн тохиргоо хийгдээгүй байна." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { booking_id, amount, user_id, access_token, description } = body as {
      booking_id: string;
      amount: number;
      user_id: string;
      access_token?: string;
      description?: string;
    };

    if (!booking_id || amount == null || !user_id) {
      return NextResponse.json(
        { error: "booking_id, amount, user_id шаардлагатай" },
        { status: 400 },
      );
    }

    const token = String(access_token ?? "").trim();
    if (!token) {
      return NextResponse.json(
        {
          error:
            "MonPay-аар төлөхийн тулд MonPay апп-аас мини апп-аа нээнэ үү (нэвтрэлт шаардлагатай).",
        },
        { status: 400 },
      );
    }

    const amountMnt = Math.round(Number(amount));
    if (!Number.isFinite(amountMnt) || amountMnt < 1) {
      return NextResponse.json({ error: "amount тоо байх ёстой" }, { status: 400 });
    }

    const webhookUrl = resolveMonpayWebhookUrl(request);
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "MonPay webhook URL тохируулаагүй (MONPAY_WEBHOOK_URL)" },
        { status: 500 },
      );
    }

    const invoice = await createInvoice(token, {
      amount: amountMnt,
      redirectUri: getMonpayRedirectUri(),
      clientServiceUrl: webhookUrl,
      description: description?.trim() || "GymHub гишүүнчлэл",
      receiver: getMonpayReceiver(),
      invoiceType: "P2B",
    });

    const invoiceId = String(invoice.id);

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceKey,
        { auth: { persistSession: false } },
      );

      await safeUpdateBookingById(supabase, booking_id, {
        payment_channel: "monpay",
        payment_status: "pending",
        qpay_invoice_id: invoiceId,
        amount: amountMnt,
        user_id,
      });
    }

    return NextResponse.json({
      success: true,
      invoice_id: invoiceId,
      id: invoiceId,
      channel: "monpay",
      status: invoice.status ?? "NEW",
      redirect_uri: invoice.redirectUri ?? getMonpayRedirectUri(),
      message: "MonPay нэхэмжлэл үүслээ. Апп дээрээ төлбөрөө баталгаажуулна уу.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("MonPay invoice error:", msg);
    return NextResponse.json(
      { error: msg || "MonPay нэхэмжлэл үүсгэхэд алдаа гарлаа." },
      { status: 500 },
    );
  }
}
