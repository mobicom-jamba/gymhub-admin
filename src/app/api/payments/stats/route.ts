import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/payments/stats — payment statistics for dashboard & mobile app */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const [totalRes, qpayRes, sonoRes, pocketRes, giftRes, recentRes] =
      await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "paid"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "paid")
          .eq("payment_channel", "qpay"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "paid")
          .eq("payment_channel", "sono"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "paid")
          .eq("payment_channel", "pocket"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "paid")
          .eq("payment_channel", "gift"),
        supabase
          .from("bookings")
          .select("id, amount, payment_channel, payment_status, created_at, paid_at")
          .eq("payment_status", "paid")
          .order("paid_at", { ascending: false })
          .limit(20),
      ]);

    return NextResponse.json({
      total_paid: totalRes.count ?? 0,
      channels: {
        qpay: qpayRes.count ?? 0,
        sono: sonoRes.count ?? 0,
        pocket: pocketRes.count ?? 0,
        gift: giftRes.count ?? 0,
      },
      recent_payments: recentRes.data ?? [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
