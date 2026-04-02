import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../../_lib/bookings";
import { isPocketConfigured, checkByOrderNumber, checkByInvoiceId } from "@/lib/pocket";

/**
 * POST /api/payment/pocket/check — Check Pocket invoice payment status
 * Accepts { invoice_id, booking_id, user_id } or { order_number, booking_id, user_id }
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("pocket");
    if (blocked) return blocked;

    if (!isPocketConfigured()) {
      return NextResponse.json({ error: "Pocket тохиргоо дутуу" }, { status: 500 });
    }

    const body = await request.json();
    const { invoice_id, order_number, booking_id, user_id } = body as {
      invoice_id?: string;
      order_number?: string;
      booking_id?: string;
      user_id?: string;
    };

    if (!invoice_id && !order_number && !booking_id) {
      return NextResponse.json(
        { error: "invoice_id, order_number, эсвэл booking_id шаардлагатай" },
        { status: 400 },
      );
    }

    // Determine which lookup to use
    // booking_id is truncated to 25 chars when used as orderNumber (Pocket API limit)
    const rawOrderNumber = order_number || booking_id;
    const lookupOrderNumber = rawOrderNumber && rawOrderNumber.length > 25
      ? rawOrderNumber.slice(0, 25)
      : rawOrderNumber;
    let status;

    if (lookupOrderNumber) {
      status = await checkByOrderNumber(lookupOrderNumber);
    } else {
      status = await checkByInvoiceId(Number(invoice_id));
    }

    const paid = status.state === "paid";

    // If paid, update Supabase booking + membership
    if (paid) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          serviceKey,
          { auth: { persistSession: false } },
        );

        // Update booking status
        const effectiveBookingId = booking_id || lookupOrderNumber;
        if (effectiveBookingId) {
          await safeUpdateBookingById(supabase, effectiveBookingId, {
            payment_status: "paid",
            paid_at: new Date().toISOString(),
          });
        }

        // Activate membership (server-side safety net)
        if (user_id && effectiveBookingId?.startsWith("membership-")) {
          try {
            const now = new Date();
            const { data: profile } = await supabase
              .from("profiles")
              .select("membership_expires_at, membership_status")
              .eq("id", user_id)
              .maybeSingle();

            let baseDate = now;
            if (profile?.membership_expires_at) {
              const currentExpiry = new Date(profile.membership_expires_at);
              if (currentExpiry > now && profile.membership_status === "active") {
                baseDate = currentExpiry;
              }
            }

            const expiresAt = new Date(baseDate);
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);

            const tierMatch = effectiveBookingId.match(/^membership-([^-]+)-/);
            const tier = tierMatch?.[1] || "early";

            await supabase
              .from("profiles")
              .update({
                membership_tier: tier,
                membership_status: "active",
                membership_started_at: now.toISOString(),
                membership_expires_at: expiresAt.toISOString(),
              })
              .eq("id", user_id);
          } catch (e) {
            console.error("Pocket membership activation failed:", e);
          }
        }
      }
    }

    return NextResponse.json({
      paid,
      state: status.state,
      description: status.description,
      amount: status.amount,
      order_number: status.orderNumber,
      invoice_id: status.id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Pocket check error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
