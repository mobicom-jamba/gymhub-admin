import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeUpdateBookingById } from "../_lib/bookings";

/**
 * POST /api/payment/pocket — Create a Pocket lending payment
 * Pocket is a "buy now, pay later" lending service with installments.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { booking_id, amount, description, user_id, phone, installments } = body as {
      booking_id: string;
      amount: number;
      description: string;
      user_id: string;
      phone?: string;
      installments?: number;
    };

    if (!booking_id || !amount || !user_id) {
      return NextResponse.json(
        { error: "booking_id, amount, and user_id required" },
        { status: 400 }
      );
    }

    const numInstallments = installments ?? 3;
    const monthlyAmount = Math.ceil(amount / numInstallments);

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false } }
    );

    // Update booking with pocket payment channel
    await safeUpdateBookingById(supabase, booking_id, {
      payment_channel: "pocket",
      payment_status: "pending",
      amount,
    });

    // Create lending record
    const { data: lending, error: lendingErr } = await supabase
      .from("lending_records")
      .insert({
        booking_id,
        user_id,
        channel: "pocket",
        amount,
        phone: phone ?? null,
        description: description ?? `Pocket зээл #${booking_id}`,
        status: "pending",
        installments: numInstallments,
        monthly_amount: monthlyAmount,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (lendingErr) {
      console.error("Lending record error:", lendingErr.message);
    }

    // Auto-approve
    if (lending) {
      await supabase
        .from("lending_records")
        .update({ status: "approved" })
        .eq("id", lending.id);

      await safeUpdateBookingById(supabase, booking_id, {
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      lending_id: lending?.id ?? null,
      channel: "pocket",
      status: "approved",
      installments: numInstallments,
      monthly_amount: monthlyAmount,
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      message: `Pocket ${numInstallments} хуваалт амжилттай баталгаажлаа`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
