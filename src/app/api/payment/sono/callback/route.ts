import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const bookingId = url.searchParams.get("booking_id");

    if (!bookingId) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    await supabase
      .from("bookings")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    return NextResponse.json({ received: true, booking_id: bookingId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
