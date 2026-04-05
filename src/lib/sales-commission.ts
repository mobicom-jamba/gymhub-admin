import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_RATE = 0.05;

/**
 * Гишүүнчлэлийн төлбөр төлөгдсөний дараа: худалдан авагчид sales_referred_by байвал комисс бүртгэнэ.
 * Ижил booking_id давтагдахгүй (DB unique).
 */
export async function recordSalesCommissionForPaidMembership(
  supabase: SupabaseClient,
  params: {
    buyerUserId: string;
    bookingId: string;
    grossAmountFallback?: number | null;
  },
): Promise<void> {
  const { buyerUserId, bookingId, grossAmountFallback } = params;
  if (!bookingId.startsWith("membership-")) return;

  let gross: number | null =
    typeof grossAmountFallback === "number" && grossAmountFallback > 0 ? grossAmountFallback : null;

  if (gross == null) {
    const { data: row, error } = await supabase.from("bookings").select("amount").eq("id", bookingId).maybeSingle();
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) return;
      console.warn("[sales-commission] bookings select:", error.message);
      return;
    }
    const a = row && typeof (row as { amount?: unknown }).amount === "number" ? (row as { amount: number }).amount : null;
    gross = a != null && a > 0 ? a : null;
  }

  if (gross == null || gross <= 0) return;

  const { data: buyer, error: buyerErr } = await supabase
    .from("profiles")
    .select("sales_referred_by")
    .eq("id", buyerUserId)
    .maybeSingle();

  if (buyerErr) {
    if (buyerErr.code === "42703" || buyerErr.message?.includes("sales_referred_by")) return;
    console.warn("[sales-commission] profile:", buyerErr.message);
    return;
  }

  const salesId = (buyer as { sales_referred_by?: string | null } | null)?.sales_referred_by;
  if (!salesId) return;

  const { data: promo, error: promoErr } = await supabase
    .from("sales_promo_codes")
    .select("commission_rate")
    .eq("sales_user_id", salesId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (promoErr) {
    if (promoErr.code === "42P01") return;
    console.warn("[sales-commission] promo:", promoErr.message);
    return;
  }

  const rateRaw = (promo as { commission_rate?: unknown } | null)?.commission_rate;
  const rate =
    typeof rateRaw === "number" && rateRaw > 0 && rateRaw <= 1 ? rateRaw : DEFAULT_RATE;

  const commission = Math.round(gross * rate * 100) / 100;

  const { error: insErr } = await supabase.from("sales_commissions").insert({
    sales_user_id: salesId,
    buyer_user_id: buyerUserId,
    booking_id: bookingId,
    gross_amount: gross,
    commission_rate: rate,
    commission_amount: commission,
  });

  if (insErr) {
    if (insErr.code === "23505") return;
    if (insErr.code === "42P01") return;
    console.warn("[sales-commission] insert:", insErr.message);
  }
}
