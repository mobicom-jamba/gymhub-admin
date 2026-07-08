import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: plans, error } = await supabase
      .from("installment_plans")
      .select("id, plan_tier, total_amount, installment_count, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!plans || plans.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    const planIds = plans.map((p) => p.id);
    const { data: payments, error: paymentsErr } = await supabase
      .from("installment_payments")
      .select("id, plan_id, installment_no, amount, due_date, status, paid_at")
      .in("plan_id", planIds)
      .order("installment_no", { ascending: true });

    if (paymentsErr) {
      return NextResponse.json({ error: paymentsErr.message }, { status: 500 });
    }

    const result = plans.map((plan) => ({
      ...plan,
      payments: (payments ?? []).filter((p) => p.plan_id === plan.id),
    }));

    return NextResponse.json({ plans: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
