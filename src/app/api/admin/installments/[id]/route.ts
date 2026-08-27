import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";
import { settleFlexyInstallmentPaid } from "@/lib/settle-flexy-payment";

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
      try {
        const settled = await settleFlexyInstallmentPaid(admin, {
          paymentId: id,
          actorId: auth.userId,
        });
        return NextResponse.json({
          ok: true,
          already: settled.alreadyPaid,
          membership_activated: settled.membershipActivated,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Хуваарь олдсонгүй.";
        const notFound = /олдсонгүй/i.test(msg);
        return NextResponse.json({ ok: false, error: msg }, { status: notFound ? 404 : 500 });
      }
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
