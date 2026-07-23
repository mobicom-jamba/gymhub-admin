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

/** Booking slug → profiles.membership_tier */
export function canonicalStoredTier(bookingTier: string): string {
  switch (bookingTier) {
    case "smart1":
    case "premium1":
    case "plus":
      return "premium1";
    case "premium":
    case "premium2":
    case "smart2":
      return "premium2";
    case "premium4":
    case "gymcore":
    case "prime":
      return "gymcore";
    case "standard3":
    case "standard":
    case "basic":
      return "standard";
    // Хуучин Early — DB-д early үлдээнэ
    case "early":
    case "early_year":
    case "early_month":
      return "early";
    default:
      return bookingTier || "standard";
  }
}

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
    const isActive = String(profile.membership_status ?? "").toLowerCase() === "active";
    const hasFutureExpiry =
      !!profile.membership_expires_at && new Date(profile.membership_expires_at) > now;

    let baseDate = now;
    if (isActive && hasFutureExpiry) {
      baseDate = new Date(profile.membership_expires_at!);
    }

    const startedAt =
      isActive && hasFutureExpiry && profile.membership_started_at
        ? profile.membership_started_at
        : now.toISOString();

    return {
      membership_tier: "early",
      membership_status: "active",
      membership_started_at: startedAt,
      membership_expires_at: addCalendarMonths(baseDate, 1).toISOString(),
    };
  }

  if (parsed.kind === "early_rest") {
    const anchor = profile.membership_started_at
      ? new Date(profile.membership_started_at)
      : now;
    return {
      // Үлдсэн 11 сар төлөгдсөний дараа Early жилийн эрх (хуучин багц)
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

  // Standard / standard3 — 6 сарын эрх; Early (legacy) + Premium 1/2 + GymCore — 1 жил.
  const expiresAt =
    parsed.tier === "standard3" || parsed.tier === "standard"
      ? addCalendarMonths(baseDate, 6)
      : addCalendarYears(baseDate, 1);

  return {
    membership_tier: canonicalStoredTier(parsed.tier),
    membership_status: "active",
    membership_started_at: now.toISOString(),
    membership_expires_at: expiresAt.toISOString(),
  };
}

const missingTableRegex = /relation .*membership_activations.* does not exist/i;

/**
 * booking-ийг гишүүнчлэл идэвхжүүлэхээр "эзэмших" оролдлого (atomic insert, text PK дээр).
 * Хуучин хувилбар нь bookings.membership_applied_at ашигладаг байсан ч bookings.id нь uuid
 * тул "membership-early-<ts>" маягийн string ID-тай хэзээ ч таарахгүй байсан (22P02) — үүнээс
 * болж claim үргэлж "already" буцаж, profiles хэзээ ч шинэчлэгдэхгүй байв. membership_activations
 * (supabase/migrations/create_membership_activations.sql) нь энэ асуудлыг зассан зориулалтын хүснэгт.
 * @returns "claimed" — энэ дуудалт эзэмшсэн (үргэлжлүүлнэ) | "already" — өмнө нь идэвхжсэн (алгасна) | "no_table" — миграц ажиллуулаагүй (fallback, guard-гүй)
 */
async function claimMembershipBooking(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string,
): Promise<"claimed" | "already" | "no_table"> {
  const { error } = await supabase
    .from("membership_activations")
    .insert({ booking_id: bookingId, user_id: userId });

  if (!error) return "claimed";

  if (error.code === "23505") return "already"; // unique_violation — өмнө нь claim хийгдсэн
  if (missingTableRegex.test(error.message ?? "") || error.code === "42P01") {
    return "no_table";
  }
  // Тодорхойгүй алдаа — давхарлахаас сэргийлж эзэмшээгүй гэж үзнэ.
  console.warn("[membership-from-booking] claim booking:", error.message);
  return "already";
}

/** Эзэмшлийг буцаах (profile шинэчлэлт бүтэлгүйтвэл дараагийн оролдлого дахин хийх боломжтой) */
async function releaseMembershipBooking(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await supabase.from("membership_activations").delete().eq("booking_id", bookingId);
  if (error && !missingTableRegex.test(error.message ?? "")) {
    console.warn("[membership-from-booking] release booking:", error.message);
  }
}

/** Төлбөр баталгаажсаны дараа profile шинэчлэх (алдаа гарвал дотроо log, throw хийхгүй) */
export async function applyMembershipActivationForPaidBooking(
  supabase: SupabaseClient,
  params: { userId: string; bookingId: string },
): Promise<boolean> {
  const { userId, bookingId } = params;
  if (!bookingId.startsWith("membership-")) return false;

  // Idempotency: booking тус бүрт зөвхөн нэг л удаа идэвхжүүлнэ (давтагдсан төлбөр шалгалт хугацаа нэмэхгүй).
  const claim = await claimMembershipBooking(supabase, bookingId, userId);
  if (claim === "already") {
    // Сервер аль хэдийн боловсруулсан — клиент дахин давхарлахгүйн тулд true буцаана.
    return true;
  }

  const now = new Date();
  const { data: profile, error: selErr } = await supabase
    .from("profiles")
    .select("membership_started_at, membership_expires_at, membership_status")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.warn("[membership-from-booking] profile select:", selErr.message);
    if (claim === "claimed") await releaseMembershipBooking(supabase, bookingId);
    return false;
  }

  const snap: ProfileMembershipSnap = {
    membership_started_at: profile?.membership_started_at ?? null,
    membership_expires_at: profile?.membership_expires_at ?? null,
    membership_status: profile?.membership_status ?? null,
  };

  const update = computeMembershipDatesAfterPayment({ bookingId, now, profile: snap });
  if (!update) {
    if (claim === "claimed") await releaseMembershipBooking(supabase, bookingId);
    return false;
  }

  const { error: upErr } = await supabase.from("profiles").update(update).eq("id", userId);
  if (upErr) {
    console.error("[membership-from-booking] profile update:", upErr.message);
    if (claim === "claimed") await releaseMembershipBooking(supabase, bookingId);
    return false;
  }
  return true;
}
