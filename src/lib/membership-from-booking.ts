import type { SupabaseClient } from "@supabase/supabase-js";

/** membership төлбөрийн booking_id-аас эхлэл/дуусах огноо тооцох (Early хуваагдсан + legacy нэг дор) */

export type ProfileMembershipSnap = {
  membership_started_at: string | null;
  membership_expires_at: string | null;
  membership_status: string | null;
};

export type ParsedMembershipBooking =
  | { kind: "early_first" }
  | { kind: "early_rest" }
  | { kind: "annual_from_payment"; tier: string };

export function parseMembershipBookingId(bookingId: string): ParsedMembershipBooking | null {
  if (!bookingId.startsWith("membership-")) return null;
  const parts = bookingId.split("-");
  if (parts.length >= 4 && parts[1] === "early" && parts[2] === "first") {
    return { kind: "early_first" };
  }
  if (parts.length >= 4 && parts[1] === "early" && parts[2] === "rest") {
    return { kind: "early_rest" };
  }
  const tier = parts[1];
  if (tier === "early" || tier === "premium") {
    return { kind: "annual_from_payment", tier };
  }
  return { kind: "annual_from_payment", tier: tier || "early" };
}

function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function addCalendarYears(from: Date, years: number): Date {
  const d = new Date(from.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/** Early зөвхөн эхний сарын төлбөрт ойролцоо хугацаа (өдөр) */
export function earlyFirstSegmentDaySpan(profile: ProfileMembershipSnap): number | null {
  if (!profile.membership_started_at || !profile.membership_expires_at) return null;
  const ms =
    new Date(profile.membership_expires_at).getTime() - new Date(profile.membership_started_at).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / 86400000;
}

export function isApproximatelyEarlyFirstSegmentOnly(profile: ProfileMembershipSnap): boolean {
  const days = earlyFirstSegmentDaySpan(profile);
  if (days == null) return false;
  return days >= 20 && days <= 45;
}

/**
 * Төлбөр баталгаажсаны дараах profiles шинэчлэлт.
 * early_rest: дуусах = анхны эхний сар эхэлсэн огноос +1 жил (төлсөн цагаас биш).
 */
export function computeMembershipDatesAfterPayment(args: {
  bookingId: string;
  now: Date;
  profile: ProfileMembershipSnap;
}): {
  membership_tier: string;
  membership_status: "active";
  membership_started_at: string;
  membership_expires_at: string;
} | null {
  const parsed = parseMembershipBookingId(args.bookingId);
  if (!parsed) return null;

  const { now, profile } = args;

  if (parsed.kind === "early_first") {
    if (
      profile.membership_expires_at &&
      profile.membership_status === "active" &&
      isApproximatelyEarlyFirstSegmentOnly(profile) &&
      new Date(profile.membership_expires_at) > now
    ) {
      return null;
    }
    return {
      membership_tier: "early",
      membership_status: "active",
      membership_started_at: now.toISOString(),
      membership_expires_at: addCalendarMonths(now, 1).toISOString(),
    };
  }

  if (parsed.kind === "early_rest") {
    const anchor = profile.membership_started_at
      ? new Date(profile.membership_started_at)
      : now;
    return {
      membership_tier: "early",
      membership_status: "active",
      membership_started_at: anchor.toISOString(),
      membership_expires_at: addCalendarYears(anchor, 1).toISOString(),
    };
  }

  let baseDate = now;
  if (profile.membership_expires_at) {
    const currentExpiry = new Date(profile.membership_expires_at);
    if (currentExpiry > now && profile.membership_status === "active") {
      baseDate = currentExpiry;
    }
  }
  return {
    membership_tier: parsed.tier,
    membership_status: "active",
    membership_started_at: now.toISOString(),
    membership_expires_at: addCalendarYears(baseDate, 1).toISOString(),
  };
}

/** Төлбөр баталгаажсаны дараа profile шинэчлэх (алдаа гарвал дотроо log, throw хийхгүй) */
export async function applyMembershipActivationForPaidBooking(
  supabase: SupabaseClient,
  params: { userId: string; bookingId: string },
): Promise<boolean> {
  const { userId, bookingId } = params;
  if (!bookingId.startsWith("membership-")) return false;

  const now = new Date();
  const { data: profile, error: selErr } = await supabase
    .from("profiles")
    .select("membership_started_at, membership_expires_at, membership_status")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.warn("[membership-from-booking] profile select:", selErr.message);
    return false;
  }

  const snap: ProfileMembershipSnap = {
    membership_started_at: profile?.membership_started_at ?? null,
    membership_expires_at: profile?.membership_expires_at ?? null,
    membership_status: profile?.membership_status ?? null,
  };

  const update = computeMembershipDatesAfterPayment({ bookingId, now, profile: snap });
  if (!update) return false;

  const { error: upErr } = await supabase.from("profiles").update(update).eq("id", userId);
  if (upErr) {
    console.error("[membership-from-booking] profile update:", upErr.message);
    return false;
  }
  return true;
}
