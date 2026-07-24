import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";

/** id = installment_payments.id. Зөвхөн админ: төлөгдсөнд тэмдэглэх / цуцлах / устгах. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Зөвхөн админ Flexy багц засах/устгах эрхтэй." },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = (await request.json()) as {
      action: "mark_paid" | "cancel_plan" | "force_delete";
    };
    const admin = createAdminClient();

    if (body.action === "mark_paid") {
      const { data: installment, error: findErr } = await admin
        .from("installment_payments")
        .select("id, plan_id, installment_no, status")
        .eq("id", id)
        .maybeSingle();

      if (findErr || !installment) {
        return NextResponse.json({ ok: false, error: "Хуваарь олдсонгүй." }, { status: 404 });
      }
      if (installment.status === "paid") {
        return NextResponse.json({ ok: true, already: true });
      }

      const { data: plan } = await admin
        .from("installment_plans")
        .select("id, booking_id, user_id")
        .eq("id", installment.plan_id)
        .maybeSingle();

      await admin
        .from("installment_payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);

      let membershipActivated = false;
      if (plan && installment.installment_no === 1) {
        try {
          membershipActivated = await applyMembershipActivationForPaidBooking(admin, {
            userId: plan.user_id,
            bookingId: plan.booking_id,
          });
          await recordSalesCommissionForPaidMembership(admin, {
            buyerUserId: plan.user_id,
            bookingId: plan.booking_id,
          });
        } catch (e) {
          console.error("Admin mark-paid membership activation failed:", e);
        }
      }

      if (plan) {
        const { count: unpaidCount } = await admin
          .from("installment_payments")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", plan.id)
          .neq("status", "paid");
        if ((unpaidCount ?? 0) === 0) {
          await admin.from("installment_plans").update({ status: "completed" }).eq("id", plan.id);
        }
      }

      return NextResponse.json({ ok: true, membership_activated: membershipActivated });
    }

    if (body.action === "cancel_plan") {
      const { data: installment } = await admin
        .from("installment_payments")
        .select("plan_id")
        .eq("id", id)
        .maybeSingle();
      if (!installment) {
        return NextResponse.json({ ok: false, error: "Хуваарь олдсонгүй." }, { status: 404 });
      }
      await admin.from("installment_plans").update({ status: "cancelled" }).eq("id", installment.plan_id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "force_delete") {
      const { data: installment } = await admin
        .from("installment_payments")
        .select("plan_id")
        .eq("id", id)
        .maybeSingle();

      // Allow deleting by plan id directly if payment id lookup fails
      let planId = installment?.plan_id ?? null;
      if (!planId) {
        const { data: plan } = await admin
          .from("installment_plans")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        planId = plan?.id ?? null;
      }
      if (!planId) {
        return NextResponse.json({ ok: false, error: "Багц олдсонгүй." }, { status: 404 });
      }

      const { error: delErr } = await admin
        .from("installment_plans")
        .delete()
        .eq("id", planId);

      if (delErr) {
        return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: planId });
    }

    return NextResponse.json({ ok: false, error: "Тодорхойгүй үйлдэл." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
