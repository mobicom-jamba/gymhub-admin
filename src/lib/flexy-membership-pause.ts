import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Flexy хуваарьт төлбөр overdue үед гишүүнчлэлийг pause;
 * төлсний дараа (overdue үлдээгүй бол) дахин active болгоно.
 * membership_expires_at өөрчлөхгүй — зөвхөн нэвтрэх эрхийг түдгэлзүүлнэ.
 */

type PlanJoin = { user_id: string; status: string } | { user_id: string; status: string }[] | null;

function userIdsFromOverdueRows(
  rows: { installment_plans: PlanJoin }[] | null,
): string[] {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    const plan = Array.isArray(row.installment_plans)
      ? row.installment_plans[0]
      : row.installment_plans;
    if (plan?.user_id && plan.status === "active") {
      ids.add(plan.user_id);
    }
  }
  return [...ids];
}

/** Active plan дээр overdue хуваарьтай бүх хэрэглэгчийн membership → paused */
export async function pauseMembershipsForOverdueFlexy(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from("installment_payments")
    .select("plan_id, installment_plans!inner(user_id, status)")
    .eq("status", "overdue")
    .eq("installment_plans.status", "active");

  if (error) {
    console.warn("[flexy-pause] select overdue:", error.message);
    return 0;
  }

  const userIds = userIdsFromOverdueRows(
    rows as { installment_plans: PlanJoin }[] | null,
  );
  if (userIds.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from("profiles")
    .update({ membership_status: "paused" })
    .in("id", userIds)
    .eq("membership_status", "active")
    .gt("membership_expires_at", nowIso)
    .select("id");

  if (upErr) {
    console.warn("[flexy-pause] pause profiles:", upErr.message);
    return 0;
  }
  return updated?.length ?? 0;
}

/**
 * Flexy төлбөр төлөгдсөний дараа: хэрэглэгчид өөр overdue үлдээгүй
 * бөгөөд status=paused бол → active (дуусах огноо хэвээр).
 */
export async function resumeMembershipAfterFlexyPayment(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;

  const { data: stillOverdue, error: odErr } = await supabase
    .from("installment_payments")
    .select("id, installment_plans!inner(user_id, status)")
    .eq("status", "overdue")
    .eq("installment_plans.user_id", userId)
    .eq("installment_plans.status", "active")
    .limit(1);

  if (odErr) {
    console.warn("[flexy-pause] check overdue:", odErr.message);
    return false;
  }
  if ((stillOverdue?.length ?? 0) > 0) return false;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("membership_status, membership_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (pErr || !profile) return false;
  if (String(profile.membership_status ?? "").toLowerCase() !== "paused") {
    return false;
  }
  if (
    !profile.membership_expires_at ||
    new Date(profile.membership_expires_at) <= new Date()
  ) {
    return false;
  }

  const { error: upErr } = await supabase
    .from("profiles")
    .update({ membership_status: "active" })
    .eq("id", userId)
    .eq("membership_status", "paused");

  if (upErr) {
    console.warn("[flexy-pause] resume:", upErr.message);
    return false;
  }
  return true;
}
