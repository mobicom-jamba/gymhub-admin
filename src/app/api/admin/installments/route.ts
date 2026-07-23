import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/verify-gym-access";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission(request, "payments.installments.view", "Flexy хуваан төлөлт харах эрхгүй.");
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();

    const { data: plans, error: plansErr } = await admin
      .from("installment_plans")
      .select("id, user_id, booking_id, plan_tier, total_amount, installment_count, status, created_at")
      .order("created_at", { ascending: false });

    if (plansErr) {
      return NextResponse.json({ ok: false, error: plansErr.message }, { status: 500 });
    }
    if (!plans || plans.length === 0) {
      return NextResponse.json({ ok: true, plans: [] });
    }

    const planIds = plans.map((p) => p.id);
    const userIds = Array.from(new Set(plans.map((p) => p.user_id)));

    const [{ data: payments, error: paymentsErr }, { data: profiles }] = await Promise.all([
      admin
        .from("installment_payments")
        .select("id, plan_id, installment_no, amount, due_date, status, paid_at")
        .in("plan_id", planIds)
        .order("installment_no", { ascending: true }),
      admin.from("profiles").select("id, full_name, phone").in("id", userIds),
    ]);

    if (paymentsErr) {
      return NextResponse.json({ ok: false, error: paymentsErr.message }, { status: 500 });
    }

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const result = plans.map((plan) => ({
      ...plan,
      profile: profileMap.get(plan.user_id) ?? null,
      payments: (payments ?? []).filter((p) => p.plan_id === plan.id),
    }));

    return NextResponse.json({ ok: true, plans: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
