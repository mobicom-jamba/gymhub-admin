import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { QPayError, checkQpayInvoice } from "@/lib/qpay-client";
import { safeFindBookingIdByInvoice, safeUpdateBookingById } from "../_lib/bookings";
import { isOfficeBookingId, markOfficeOrderPaid } from "@/lib/office-order-settle";
import {
  findFlexyPaymentForQpayCallback,
  settleFlexyInstallmentPaid,
} from "@/lib/settle-flexy-payment";

async function handleCallback(request: Request) {
  try {
    const rawBody = await request.text();
    let payload: Record<string, unknown> = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }

    const url = new URL(request.url);
    const bookingId = url.searchParams.get("booking_id");
    const channelHint = (url.searchParams.get("channel") ?? "").toLowerCase();
    const planIdHint = url.searchParams.get("plan_id");
    const installmentHint = Number(url.searchParams.get("installment_no") ?? "");
    const invoiceId =
      (payload.invoice_id as string | undefined) ??
      (payload.object_id as string | undefined) ??
      url.searchParams.get("invoice_id") ??
      url.searchParams.get("object_id") ??
      null;
    const paymentStatus = (payload.payment_status as string | undefined)?.toUpperCase();

    const supabase = createAdminClient();

    const flexy = await findFlexyPaymentForQpayCallback(supabase, {
      invoiceId,
      bookingId,
      planId: planIdHint,
      installmentNo: Number.isFinite(installmentHint) && installmentHint > 0 ? installmentHint : null,
    });

    if (flexy || channelHint === "gymfintech" || channelHint === "flexy") {
      const invoiceToCheck = invoiceId || flexy?.qpayInvoiceId || null;
      let paid = paymentStatus === "PAID";
      let paidAmount: number | null = null;

      if (invoiceToCheck) {
        try {
          const result = await checkQpayInvoice(invoiceToCheck);
          paid = result.paid || paid;
          paidAmount =
            typeof result.paid_amount === "number" && result.paid_amount > 0
              ? result.paid_amount
              : null;
        } catch (e) {
          console.warn("[qpay-callback] flexy check:", e instanceof Error ? e.message : e);
        }
      }

      if (paid && flexy) {
        const settled = await settleFlexyInstallmentPaid(supabase, {
          paymentId: flexy.paymentId,
          invoiceId: invoiceToCheck,
          userId: flexy.userId,
          paidAmount,
        });
        return NextResponse.json({
          received: true,
          channel: "gymfintech",
          booking_id: flexy.bookingId,
          invoice_id: invoiceToCheck,
          membership_activated: settled.membershipActivated,
        });
      }

      return NextResponse.json({
        received: true,
        channel: "gymfintech",
        booking_id: flexy?.bookingId ?? bookingId,
        invoice_id: invoiceToCheck,
        payment_status: paymentStatus ?? null,
        paid: false,
      });
    }

    let resolvedBookingId = bookingId;
    if (!resolvedBookingId && invoiceId) {
      resolvedBookingId = await safeFindBookingIdByInvoice(supabase, invoiceId);
    }

    if (resolvedBookingId && (!paymentStatus || paymentStatus === "PAID")) {
      if (isOfficeBookingId(resolvedBookingId)) {
        // Callback-ийн үгэнд итгэлгүй — дүнг нь QPay-гээс шалгаж авна.
        let officePaidAmount: number | null = null;
        if (invoiceId) {
          try {
            const verified = await checkQpayInvoice(invoiceId);
            officePaidAmount =
              typeof verified.paid_amount === "number" ? verified.paid_amount : null;
          } catch {
            officePaidAmount = null;
          }
        }
        await markOfficeOrderPaid(supabase, resolvedBookingId, {
          invoiceId,
          paidAmount: officePaidAmount,
        });
      }
      const updateError = await safeUpdateBookingById(supabase, resolvedBookingId, {
        payment_status: "paid",
        payment_channel: "qpay",
        paid_at: new Date().toISOString(),
      });
      if (updateError) {
        return NextResponse.json({ error: updateError }, { status: 500 });
      }
    }

    return NextResponse.json({
      received: true,
      booking_id: resolvedBookingId,
      invoice_id: invoiceId,
      payment_status: paymentStatus ?? null,
    });
  } catch (err: unknown) {
    if (err instanceof QPayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleCallback(request);
}

export async function GET(request: Request) {
  return handleCallback(request);
}
