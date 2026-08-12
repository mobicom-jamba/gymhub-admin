import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePermission, verifyBearerUser } from "@/lib/verify-gym-access";
import { buildInstallmentSchedule, maxInstallmentsForTier } from "@/lib/installment-schedule";
import { getPaymentAppSettings } from "@/lib/payment-app-settings";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission(
      request,
      "payments.installments.view",
      "Flexy хуваан төлөлт харах эрхгүй.",
    );
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

/** Админ Flexy багц үүсгэх — QPay автомат үүсгэхгүй. */
export async function POST(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Зөвхөн админ Flexy багц үүсгэх эрхтэй." },
        { status: 403 },
      );
    }

    let body: {
      user_id?: string;
      plan_tier?: string;
      total_amount?: number;
      installment_count?: number;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const userId = String(body.user_id ?? "").trim();
    const planTier = String(body.plan_tier ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const totalAmount = Number(body.total_amount);
    const installmentCount = Number(body.installment_count);

    if (!userId || !planTier) {
      return NextResponse.json(
        { ok: false, error: "user_id болон plan_tier шаардлагатай." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ ok: false, error: "Дүн буруу байна." }, { status: 400 });
    }

    const settings = await getPaymentAppSettings();
    const pkg = settings.packages.find((p) => p.id === planTier);
    const months = pkg?.months;
    const maxInstallments = maxInstallmentsForTier(planTier, months);

    if (
      !Number.isInteger(installmentCount) ||
      installmentCount < 2 ||
      installmentCount > maxInstallments
    ) {
      return NextResponse.json(
        { ok: false, error: `Хуваарийн тоо 2–${maxInstallments} хооронд байх ёстой.` },
        { status: 400 },
      );
    }

    const schedule = buildInstallmentSchedule({
      totalAmount: Math.floor(totalAmount),
      installmentCount,
    });
    if (schedule.some((item) => item.amount <= 0)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Энэ дүнг сонгосон хуваарийн тоонд хуваахад 0-тэй тэнцэх хуваарь үүснэ. Хуваарийн тоог багасгана уу.",
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr || !profile) {
      return NextResponse.json({ ok: false, error: "Хэрэглэгч олдсонгүй." }, { status: 404 });
    }

    const bookingId = `membership-${planTier}-${Date.now()}`;

    const { data: plan, error: planErr } = await admin
      .from("installment_plans")
      .insert({
        user_id: userId,
        booking_id: bookingId,
        plan_tier: planTier,
        total_amount: Math.floor(totalAmount),
        installment_count: installmentCount,
        status: "active",
      })
      .select(
        "id, user_id, booking_id, plan_tier, total_amount, installment_count, status, created_at",
      )
      .single();

    if (planErr || !plan) {
      return NextResponse.json(
        { ok: false, error: `Flexy багц үүсгэхэд алдаа: ${planErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    const { error: paymentsErr } = await admin.from("installment_payments").insert(
      schedule.map((item) => ({
        plan_id: plan.id,
        installment_no: item.installment_no,
        amount: item.amount,
        due_date: item.due_date,
        status: "pending",
      })),
    );

    if (paymentsErr) {
      await admin.from("installment_plans").delete().eq("id", plan.id);
      return NextResponse.json(
        { ok: false, error: `Хуваарь үүсгэхэд алдаа: ${paymentsErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
      schedule,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
