import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import {
  createInvoice,
  getMonpayReceiver,
  isMonpayConfigured,
} from "@/lib/monpay";

const MONPAY_WEBHOOK_PATH = "/api/payment/monpay/webhook";

function resolveWebhookUrl(request: Request): string {
  const explicit = (process.env.MONPAY_WEBHOOK_URL ?? "").trim();
  if (explicit) return explicit;

  const base = (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (base) return `${base.replace(/\/$/, "")}${MONPAY_WEBHOOK_PATH}`;

  try {
    const reqUrl = new URL(request.url);
    return `${reqUrl.origin}${MONPAY_WEBHOOK_PATH}`;
  } catch {
    return "";
  }
}

/**
 * POST /api/payment/monpay — Create MonPay invoice (mini-app user token required)
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

    const webhookUrl = resolveWebhookUrl(request);
    if (!webhookUrl) {
      return NextResponse.json({ error: "MonPay webhook URL тохируулаагүй" }, { status: 500 });
    }

    const invoice = await createInvoice(token, {
      amount: amountMnt,
      redirectUri: webhookUrl,
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
      redirect_uri: invoice.redirectUri,
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
