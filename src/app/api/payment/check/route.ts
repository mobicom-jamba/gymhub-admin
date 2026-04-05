import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePaymentChannel } from "@/lib/payment-app-settings";
import { safeUpdateBookingById } from "../_lib/bookings";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";

const QPAY_BASE = process.env.QPAY_BASE_URL ?? "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = process.env.QPAY_CLIENT_ID ?? process.env.QPAY_USERNAME ?? "";
const QPAY_PASSWORD = process.env.QPAY_CLIENT_SECRET ?? process.env.QPAY_PASSWORD ?? "";

let _token: string | null = null;
let _tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt) return _token;
  if (!QPAY_USERNAME || !QPAY_PASSWORD) {
    throw new Error("QPay credentials are not configured");
  }
  const basic = Buffer.from(`${QPAY_USERNAME}:${QPAY_PASSWORD}`).toString("base64");
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`QPay auth failed (${res.status})`);
  const data = await res.json();
  _token = data.access_token as string;
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return _token;
}

export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("qpay");
    if (blocked) return blocked;

    const { invoice_id, booking_id, user_id } = await request.json() as {
      invoice_id: string;
      booking_id?: string;
      user_id?: string;
    };

    if (!invoice_id) {
      return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
    }

    const token = await getToken();

    const checkRes = await fetch(`${QPAY_BASE}/payment/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        object_type: "INVOICE",
        object_id: invoice_id,
        offset: {
          page_number: 1,
          page_limit: 100,
        },
      }),
    });

    if (!checkRes.ok) {
      const errText = await checkRes.text();
      return NextResponse.json(
        { error: `QPay төлбөр шалгахад алдаа гарлаа: ${errText || checkRes.status}` },
        { status: checkRes.status },
      );
    }

    const result = await checkRes.json() as {
      payment_status?: string;
      count?: number;
      paid_amount?: number;
      rows?: Array<{ payment_status?: string }>;
    };
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const paid = result.payment_status === "PAID" ||
      (typeof result.paid_amount === "number" && result.paid_amount > 0) ||
      rows.some((row) => row?.payment_status === "PAID");

    // If paid, update Supabase
    if (paid) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
          { auth: { persistSession: false } }
        );

        // Update booking status
        if (booking_id) {
          await safeUpdateBookingById(supabase, booking_id, {
            payment_status: "paid",
            paid_at: new Date().toISOString(),
          });
        }

        // Activate membership for 1 year (server-side safety net)
        if (user_id && booking_id?.startsWith("membership-")) {
          try {
            const now = new Date();
            // Check current membership — extend from expiry if still active
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

            // Extract tier from booking_id: "membership-early-1234567890"
            const tierMatch = booking_id.match(/^membership-([^-]+)-/);
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

            const paidAmt =
              typeof result.paid_amount === "number" && result.paid_amount > 0
                ? result.paid_amount
                : null;
            await recordSalesCommissionForPaidMembership(supabase, {
              buyerUserId: user_id,
              bookingId: booking_id,
              grossAmountFallback: paidAmt,
            });
          } catch (e) {
            console.error("Server-side membership activation failed:", e);
          }
        }
      }
    }

    return NextResponse.json({
      paid,
      payment_status: result.payment_status,
      count: result.count ?? rows.length,
      paid_amount: result.paid_amount ?? 0,
      rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
