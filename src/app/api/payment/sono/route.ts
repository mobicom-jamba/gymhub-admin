import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/payment/sono — Create a Sono lending payment
 * Sono is a "buy now, pay later" lending service.
 */
export async function POST(request: Request) {
  try {
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
        { error: "booking_id, amount, and user_id required" },
        { status: 400 }
      );
    }

    // Store the lending record in Supabase
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false } }
    );

    // Update booking with sono payment channel
    await supabase
      .from("bookings")
      .update({
        payment_channel: "sono",
        payment_status: "pending",
        amount,
      })
      .eq("id", booking_id);

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
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      })
      .select()
      .single();

    if (lendingErr) {
      // If lending_records table doesn't exist yet, still mark booking
      console.error("Lending record error:", lendingErr.message);
    }

    // Mark as approved (auto-approve for now)
    if (lending) {
      await supabase
        .from("lending_records")
        .update({ status: "approved" })
        .eq("id", lending.id);

      await supabase
        .from("bookings")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", booking_id);
    }

    return NextResponse.json({
      success: true,
      lending_id: lending?.id ?? null,
      channel: "sono",
      status: "approved",
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      message: "Sono зээл амжилттай баталгаажлаа",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
