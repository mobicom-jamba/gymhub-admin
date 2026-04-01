import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import { proxyFetch } from "@/lib/proxy-fetch";

/**
 * POST /api/payment/sono — Create a Sono lending payment
 * Sono shop integration via rico.mn:
 * - create invoice: POST /api/w/pos/invoices
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("sono");
    if (blocked) return blocked;

    const body = await request.json();
    const { booking_id, amount, description, user_id, phone } = body as {
      booking_id: string;
      amount: number;
      description: string;
      user_id: string;
      phone?: string;
    };

    if (!booking_id || !amount || !user_id) {
      return NextResponse.json(
        { error: "booking_id, amount, user_id шаардлагатай" },
        { status: 400 }
      );
    }
    if (amount < 10000) {
      return NextResponse.json(
        { error: "Sono invoice-ийн доод дүн 10,000₮ байна" },
        { status: 400 },
      );
    }

    const sonoBaseUrl = process.env.SONO_BASE_URL ?? "https://rico.mn";
    const sonoAuthUser = process.env.SONO_AUTH_USER ?? "";
    const sonoAuthToken = process.env.SONO_AUTH_TOKEN ?? "";
    const sonoCallbackUrl =
      process.env.SONO_CALLBACK_URL ??
      `${process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/payment/sono/callback`;
    const sonoTrackingData = process.env.SONO_TRACKING_DATA ?? "";

    if (!sonoAuthUser || !sonoAuthToken) {
      return NextResponse.json(
        { error: "SONO_AUTH_USER болон SONO_AUTH_TOKEN тохируулагдаагүй байна" },
        { status: 500 },
      );
    }

    const invoiceId = `GH${booking_id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 34)}${Date.now().toString().slice(-12)}`.slice(0, 50);
    const callbackUrl = new URL(sonoCallbackUrl);
    callbackUrl.searchParams.set("booking_id", booking_id);

    const sonoRes = await proxyFetch(`${sonoBaseUrl}/api/w/pos/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-and-auth-token": sonoAuthToken,
        "x-and-auth-user": sonoAuthUser,
      },
      body: JSON.stringify({
        amount,
        description: description ?? `Sono invoice #${booking_id}`,
        callback_url: callbackUrl.toString(),
        invoice_id: invoiceId,
        phoneNumber: phone ?? "",
        duration: "",
        trackingData: sonoTrackingData,
      }),
    });

    const sonoRaw = await sonoRes.text();
    let sonoData: Record<string, unknown> = {};
    try {
      sonoData = JSON.parse(sonoRaw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: `Sono хариу parse хийж чадсангүй: ${sonoRaw}` },
        { status: 502 },
      );
    }

    if (!sonoRes.ok) {
      return NextResponse.json(
        { error: `Sono API алдаа (${sonoRes.status})`, details: sonoData },
        { status: sonoRes.status },
      );
    }

    const code = Number(sonoData.code ?? 0);
    if (code !== 0) {
      const errObj = (sonoData.response ?? {}) as Record<string, unknown>;
      const errMessage =
        (errObj.ErrorMessage as string | undefined) ??
        (sonoData.description as string | undefined) ??
        "Sono invoice үүсгэхэд алдаа гарлаа";
      return NextResponse.json(
        { error: errMessage, details: sonoData },
        { status: 400 },
      );
    }

    const responseObj = (sonoData.response ?? {}) as Record<string, unknown>;
    const returnedInvoiceId = (responseObj.invoice_id as string | undefined) ?? invoiceId;
    const qrString = (responseObj.qr_string as string | undefined) ?? "";

    // Store/update payment state in Supabase
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false } }
    );

    // Update booking with sono payment channel (pending until paid check/callback)
    const bookingError = await safeUpdateBookingById(supabase, booking_id, {
      payment_channel: "sono",
      payment_status: "pending",
      qpay_invoice_id: returnedInvoiceId,
      amount,
    });
    if (bookingError) {
      return NextResponse.json({ error: bookingError }, { status: 500 });
    }

    // Create lending record
    const { data: lending, error: lendingErr } = await supabase
      .from("lending_records")
      .insert({
        booking_id,
        user_id,
        channel: "sono",
        amount,
        phone: phone ?? null,
        description: description ?? `Sono зээл #${booking_id}`,
        status: "pending",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (lendingErr) console.error("Lending record error:", lendingErr.message);

    return NextResponse.json({
      success: true,
      lending_id: lending?.id ?? null,
      channel: "sono",
      status: "pending",
      invoice_id: returnedInvoiceId,
      qr_string: qrString,
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      message: "Sono нэхэмжлэл амжилттай үүслээ. Төлбөрөө үргэлжлүүлнэ үү.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
