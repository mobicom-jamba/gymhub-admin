import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureFlexyPaidBooking } from "@/lib/ensure-flexy-paid-booking";
import { resumeMembershipAfterFlexyPayment } from "@/lib/flexy-membership-pause";
import { applyMembershipActivationForPaidBooking } from "@/lib/membership-from-booking";
import { recordSalesCommissionForPaidMembership } from "@/lib/sales-commission";

const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

export function buildFlexyQpayCallbackUrl(params: {
  bookingId: string;
  planId?: string;
  installmentNo?: number;
}): string {
  const url = new URL(QPAY_CALLBACK_URL);
  url.searchParams.set("booking_id", params.bookingId);
  url.searchParams.set("channel", "gymfintech");
  if (params.planId) url.searchParams.set("plan_id", params.planId);
  if (params.installmentNo) {
    url.searchParams.set("installment_no", String(params.installmentNo));
  }
  return url.toString();
}

export type FlexyPaymentRef = {
  paymentId: string;
  planId: string;
  installmentNo: number;
  amount: number;
  status: string;
  qpayInvoiceId: string | null;
  bookingId: string;
  userId: string;
};

type InstallmentRow = {
  id: string;
  plan_id: string;
  installment_no: number;
  amount: number | null;
  status: string | null;
  qpay_invoice_id: string | null;
};

type PlanRow = {
  id: string;
  booking_id: string;
  user_id: string;
};

function toRef(pay: InstallmentRow, plan: PlanRow): FlexyPaymentRef {
  return {
    paymentId: pay.id,
    planId: plan.id,
    installmentNo: Number(pay.installment_no) || 0,
    amount: Number(pay.amount) || 0,
    status: String(pay.status ?? ""),
    qpayInvoiceId: pay.qpay_invoice_id,
    bookingId: plan.booking_id,
    userId: plan.user_id,
  };
}

async function loadPlan(
  supabase: SupabaseClient,
  planId: string,
): Promise<PlanRow | null> {
  const { data } = await supabase
    .from("installment_plans")
    .select("id, booking_id, user_id")
    .eq("id", planId)
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

export async function findFlexyPaymentForQpayCallback(
  supabase: SupabaseClient,
  params: {
    invoiceId?: string | null;
    bookingId?: string | null;
    planId?: string | null;
    installmentNo?: number | null;
  },
): Promise<FlexyPaymentRef | null> {
  const invoiceId = params.invoiceId?.trim() || "";
  const planId = params.planId?.trim() || "";
  const bookingId = params.bookingId?.trim() || "";
  const installmentNo =
    typeof params.installmentNo === "number" && params.installmentNo > 0
      ? params.installmentNo
      : null;

  if (invoiceId) {
    const { data: pay } = await supabase
      .from("installment_payments")
      .select("id, plan_id, installment_no, amount, status, qpay_invoice_id")
      .eq("qpay_invoice_id", invoiceId)
      .maybeSingle();
    if (pay) {
      const plan = await loadPlan(supabase, pay.plan_id);
      if (plan) return toRef(pay as InstallmentRow, plan);
    }
  }

  let resolvedPlanId = planId;
  if (!resolvedPlanId && bookingId) {
    const { data: plans } = await supabase
      .from("installment_plans")
      .select("id, booking_id, user_id")
      .eq("booking_id", bookingId)
      .in("status", ["active", "completed"])
      .order("created_at", { ascending: false })
      .limit(1);
    resolvedPlanId = plans?.[0]?.id ?? "";
  }
  if (!resolvedPlanId) return null;

  const plan = await loadPlan(supabase, resolvedPlanId);
  if (!plan) return null;

  if (installmentNo) {
    const { data: pay } = await supabase
      .from("installment_payments")
      .select("id, plan_id, installment_no, amount, status, qpay_invoice_id")
      .eq("plan_id", resolvedPlanId)
      .eq("installment_no", installmentNo)
      .maybeSingle();
    if (pay) return toRef(pay as InstallmentRow, plan);
  }

  const { data: unpaidRows } = await supabase
    .from("installment_payments")
    .select("id, plan_id, installment_no, amount, status, qpay_invoice_id")
    .eq("plan_id", resolvedPlanId)
    .neq("status", "paid")
    .not("qpay_invoice_id", "is", null)
    .order("installment_no", { ascending: true })
    .limit(1);

  const unpaid = unpaidRows?.[0];
  if (unpaid) return toRef(unpaid as InstallmentRow, plan);
  return null;
}

export async function settleFlexyInstallmentPaid(
  supabase: SupabaseClient,
  args: {
    paymentId?: string;
    planId?: string;
    installmentNo?: number;
    invoiceId?: string | null;
    userId?: string;
    actorId?: string | null;
    paidAmount?: number | null;
    paidAt?: string;
  },
): Promise<{ membershipActivated: boolean; alreadyPaid: boolean }> {
  let pay: InstallmentRow | null = null;

  if (args.paymentId) {
    const { data } = await supabase
      .from("installment_payments")
      .select("id, plan_id, installment_no, amount, status, qpay_invoice_id")
      .eq("id", args.paymentId)
      .maybeSingle();
    pay = (data as InstallmentRow | null) ?? null;
  } else if (args.planId && args.installmentNo) {
    const { data } = await supabase
      .from("installment_payments")
      .select("id, plan_id, installment_no, amount, status, qpay_invoice_id")
      .eq("plan_id", args.planId)
      .eq("installment_no", args.installmentNo)
      .maybeSingle();
    pay = (data as InstallmentRow | null) ?? null;
  }

  if (!pay) {
    throw new Error("Flexy хуваарь олдсонгүй");
  }

  const plan = await loadPlan(supabase, pay.plan_id);
  if (!plan) {
    throw new Error("Flexy багц олдсонгүй");
  }

  const paidAt = args.paidAt?.trim() || new Date().toISOString();
  const alreadyPaid = String(pay.status ?? "").toLowerCase() === "paid";

  if (!alreadyPaid) {
    const { error } = await supabase
      .from("installment_payments")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", pay.id);
    if (error) throw new Error(error.message);
  }

  const amount =
    Number(pay.amount) ||
    (typeof args.paidAmount === "number" && args.paidAmount > 0 ? args.paidAmount : 0);

  await ensureFlexyPaidBooking(supabase, {
    bookingId: plan.booking_id,
    userId: plan.user_id,
    amount,
    paidAt,
    qpayInvoiceId: pay.qpay_invoice_id ?? args.invoiceId ?? null,
  });

  const uid = args.userId || plan.user_id;
  let membershipActivated = alreadyPaid;

  if (pay.installment_no === 1) {
    try {
      membershipActivated = await applyMembershipActivationForPaidBooking(supabase, {
        userId: uid,
        bookingId: plan.booking_id,
        actorId: args.actorId,
      });
      const paidAmt =
        typeof args.paidAmount === "number" && args.paidAmount > 0 ? args.paidAmount : amount || null;
      await recordSalesCommissionForPaidMembership(supabase, {
        buyerUserId: uid,
        bookingId: plan.booking_id,
        grossAmountFallback: paidAmt,
      });
    } catch (e) {
      console.error("Flexy membership activation failed:", e);
    }
  } else {
    try {
      const resumed = await resumeMembershipAfterFlexyPayment(supabase, uid, {
        actorId: args.actorId,
        bookingId: plan.booking_id,
      });
      if (resumed) membershipActivated = true;
    } catch (e) {
      console.error("Flexy membership resume failed:", e);
    }
  }

  const { count: unpaidCount } = await supabase
    .from("installment_payments")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .neq("status", "paid");

  if ((unpaidCount ?? 0) === 0) {
    await supabase.from("installment_plans").update({ status: "completed" }).eq("id", plan.id);
  }

  return { membershipActivated, alreadyPaid };
}
