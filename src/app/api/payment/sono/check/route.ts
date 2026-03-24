import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeUpdateBookingById } from "../../_lib/bookings";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { invoice_id, booking_id } = body as {
      invoice_id: string;
      booking_id?: string;
    };

    if (!invoice_id) {
      return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
    }

    const sonoBaseUrl = process.env.SONO_BASE_URL ?? "https://rico.mn";
    const sonoAuthUser = process.env.SONO_AUTH_USER ?? "";
    const sonoAuthToken = process.env.SONO_AUTH_TOKEN ?? "";

    if (!sonoAuthUser || !sonoAuthToken) {
      return NextResponse.json(
        { error: "SONO_AUTH_USER болон SONO_AUTH_TOKEN тохируулагдаагүй байна" },
        { status: 500 },
      );
    }

    const sonoRes = await fetch(`${sonoBaseUrl}/api/w/invoices/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-and-auth-token": sonoAuthToken,
        "x-and-auth-user": sonoAuthUser,
      },
      body: JSON.stringify({ invoice_id }),
    });

    const sonoRaw = await sonoRes.text();
    let sonoData: Record<string, unknown> = {};
    try {
      sonoData = JSON.parse(sonoRaw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: `Sono check parse алдаа: ${sonoRaw}` },
        { status: 502 },
      );
    }

    if (!sonoRes.ok) {
      return NextResponse.json(
        { error: `Sono check API алдаа (${sonoRes.status})`, details: sonoData },
        { status: sonoRes.status },
      );
    }

    const code = Number(sonoData.code ?? 0);
    if (code !== 0) {
      const errObj = (sonoData.response ?? {}) as Record<string, unknown>;
      const errMessage =
        (errObj.ErrorMessage as string | undefined) ??
        (sonoData.description as string | undefined) ??
        "Sono нэхэмжлэл шалгахад алдаа гарлаа";
      return NextResponse.json(
        { error: errMessage, details: sonoData },
        { status: 400 },
      );
    }

    const responseObj = (sonoData.response ?? {}) as Record<string, unknown>;
    const paymentStatus = String(responseObj.payment_status ?? "").toUpperCase();
    const paid = paymentStatus === "PAID";

    if (paid && booking_id && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } },
      );
      await safeUpdateBookingById(supabase, booking_id, {
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      paid,
      payment_status: paymentStatus || "NOTPAID",
      details: responseObj,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
