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
  source: "booking" | "flexy" | "activation" | "admin";
  /** Flexy: тухайн өдөр төлсөн хуваарийн дугаар */
  installment_no?: number | null;
  /** Flexy: нийт хуваарийн тоо */
  installment_count?: number | null;
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
 * Төлбөрийн өдөр шүүлтүүрт: paid bookings + Flexy + payment activations +
 * admin гараар идэвхжүүлсэн гишүүд.
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

    const seenUsers = new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]);

    // Flexy: installment_payments.paid_at (membership-* booking rows often missing from bookings)
    const { data: flexyPays, error: flexyErr } = await admin
      .from("installment_payments")
      .select("id, plan_id, installment_no, paid_at, qpay_invoice_id")
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
        .select("id, user_id, booking_id, created_at, installment_count")
        .in("id", planIds);

      if (plansErr) {
        console.warn("paid-day flexy plans:", plansErr.message);
      } else {
        const planMap = new Map((plans ?? []).map((p) => [p.id, p]));
        for (const pay of flexyPays!) {
          const plan = planMap.get(pay.plan_id);
          const userId = plan?.user_id ?? null;
          if (!userId) continue;

          const installmentNo =
            typeof pay.installment_no === "number" ? pay.installment_no : null;
          const installmentCount =
            typeof plan?.installment_count === "number"
              ? plan.installment_count
              : null;

          // Already have booking/activation for this user today — attach Flexy
          // installment number instead of dropping the Flexy row.
          const existing = rows.find((r) => r.user_id === userId);
          if (existing) {
            if (!existing.payment_channel) existing.payment_channel = "gymfintech";
            if (existing.installment_no == null) {
              existing.installment_no = installmentNo;
              existing.installment_count = installmentCount;
            }
            if (existing.source !== "flexy" && !existing.qpay_invoice_id) {
              existing.qpay_invoice_id = pay.qpay_invoice_id ?? null;
            }
            continue;
          }

          seenUsers.add(userId);
          rows.push({
            id: `flexy-${pay.id}`,
            user_id: userId,
            paid_at: pay.paid_at ?? null,
            created_at: plan?.created_at ?? pay.paid_at ?? null,
            payment_channel: "gymfintech",
            qpay_invoice_id: pay.qpay_invoice_id ?? null,
            source: "flexy",
            installment_no: installmentNo,
            installment_count: installmentCount,
          });
        }
      }
    }

    // Real membership activations that day (not admin-only profile date edits)
    const { data: activations, error: actErr } = await admin
      .from("membership_activations")
      .select("booking_id, user_id, applied_at")
      .gte("applied_at", start)
      .lt("applied_at", end)
      .order("applied_at", { ascending: false });

    if (actErr) {
      console.warn("paid-day activations:", actErr.message);
    } else if ((activations ?? []).length > 0) {
      const bookingIds = Array.from(
        new Set(
          (activations ?? [])
            .map((a) => a.booking_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );
      const channelByBooking = new Map<string, string | null>();
      if (bookingIds.length > 0) {
        const { data: actBookings } = await admin
          .from("bookings")
          .select("id, payment_channel, qpay_invoice_id")
          .in("id", bookingIds);
        for (const b of actBookings ?? []) {
          channelByBooking.set(
            b.id,
            b.payment_channel ?? (b.qpay_invoice_id ? "qpay" : null),
          );
        }
      }
      for (const a of activations ?? []) {
        const userId = a.user_id ?? null;
        if (!userId || seenUsers.has(userId)) continue;
        seenUsers.add(userId);
        const bookingId = typeof a.booking_id === "string" ? a.booking_id : "";
        rows.push({
          id: `activation-${bookingId || userId}`,
          user_id: userId,
          paid_at: a.applied_at ?? null,
          created_at: a.applied_at ?? null,
          payment_channel: bookingId ? channelByBooking.get(bookingId) ?? null : null,
          qpay_invoice_id: null,
          source: "activation",
        });
      }
    }

    // Admin гараар идэвхжүүлсэн (төлбөргүй) — audit log-оор тухайн өдөр active болгосон.
    const { data: adminAudits, error: adminAuditErr } = await admin
      .from("membership_audit_logs")
      .select(
        "id, profile_id, created_at, source, new_membership_status, new_membership_started_at, old_membership_status",
      )
      .eq("source", "admin")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false });

    if (adminAuditErr) {
      console.warn("paid-day admin audits:", adminAuditErr.message);
    } else {
      for (const a of adminAudits ?? []) {
        const userId = a.profile_id ?? null;
        if (!userId || seenUsers.has(userId)) continue;
        const newStatus = String(a.new_membership_status ?? "")
          .trim()
          .toLowerCase();
        const oldStatus = String(a.old_membership_status ?? "")
          .trim()
          .toLowerCase();
        // Зөвхөн идэвхжүүлсэн / дахин идэвхжүүлсэн үйлдэл
        if (newStatus !== "active") continue;
        if (oldStatus === "active") continue;

        seenUsers.add(userId);
        rows.push({
          id: `admin-${a.id}`,
          user_id: userId,
          paid_at: a.created_at ?? a.new_membership_started_at ?? null,
          created_at: a.created_at ?? null,
          payment_channel: "admin",
          qpay_invoice_id: null,
          source: "admin",
        });
      }
    }

    // Drop inactive profiles (admin grant that day still keeps active members).
    const userIds = Array.from(seenUsers);
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, membership_status")
        .in("id", userIds);
      const unpaid = new Set(
        (profiles ?? [])
          .filter((p) => {
            const s = String(p.membership_status ?? "inactive").trim().toLowerCase();
            return s !== "active" && s !== "expired";
          })
          .map((p) => p.id),
      );
      if (unpaid.size > 0) {
        return NextResponse.json({
          ok: true,
          rows: rows.filter((r) => !r.user_id || !unpaid.has(r.user_id)),
        });
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
