import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

export type PaidDayRow = {
  id: string;
  user_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  payment_channel?: string | null;
  qpay_invoice_id?: string | null;
  source: "booking" | "flexy" | "membership_start";
};

function requiredIso(url: URL, key: string): string | null {
  const v = url.searchParams.get(key);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * GET /api/admin/paid-day?start=ISO&end=ISO
 * Төлбөрийн өдөр шүүлтүүрт: paid bookings + Flexy installment payments.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin && !auth.isModerator && !auth.isSales) {
      return NextResponse.json({ error: "Хандах эрхгүй." }, { status: 403 });
    }

    const url = new URL(request.url);
    const start = requiredIso(url, "start");
    const end = requiredIso(url, "end");
    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing/invalid query params. Use ?start=ISO&end=ISO" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const rows: PaidDayRow[] = [];

    const { data: bookings, error: bookingsErr } = await admin
      .from("bookings")
      .select("id, user_id, paid_at, created_at, payment_channel, qpay_invoice_id")
      .eq("payment_status", "paid")
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("paid_at", { ascending: false });

    if (bookingsErr) {
      return NextResponse.json({ error: bookingsErr.message }, { status: 500 });
    }

    for (const b of bookings ?? []) {
      rows.push({
        id: b.id,
        user_id: b.user_id ?? null,
        paid_at: b.paid_at ?? null,
        created_at: b.created_at ?? null,
        payment_channel: b.payment_channel ?? null,
        qpay_invoice_id: b.qpay_invoice_id ?? null,
        source: "booking",
      });
    }

    // Flexy: installment_payments.paid_at (membership-* booking rows often missing from bookings)
    const { data: flexyPays, error: flexyErr } = await admin
      .from("installment_payments")
      .select("id, plan_id, paid_at, qpay_invoice_id")
      .eq("status", "paid")
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("paid_at", { ascending: false });

    if (flexyErr) {
      console.warn("paid-day flexy payments:", flexyErr.message);
    } else if ((flexyPays ?? []).length > 0) {
      const planIds = Array.from(new Set(flexyPays!.map((p) => p.plan_id).filter(Boolean)));
      const { data: plans, error: plansErr } = await admin
        .from("installment_plans")
        .select("id, user_id, booking_id, created_at")
        .in("id", planIds);

      if (plansErr) {
        console.warn("paid-day flexy plans:", plansErr.message);
      } else {
        const planMap = new Map((plans ?? []).map((p) => [p.id, p]));
        const seenUsers = new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]);
        for (const pay of flexyPays!) {
          const plan = planMap.get(pay.plan_id);
          const userId = plan?.user_id ?? null;
          if (userId && seenUsers.has(userId)) continue;
          if (userId) seenUsers.add(userId);
          rows.push({
            id: `flexy-${pay.id}`,
            user_id: userId,
            paid_at: pay.paid_at ?? null,
            created_at: plan?.created_at ?? pay.paid_at ?? null,
            payment_channel: "gymfintech",
            qpay_invoice_id: pay.qpay_invoice_id ?? null,
            source: "flexy",
          });
        }
      }
    }

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
