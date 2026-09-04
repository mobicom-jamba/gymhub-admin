import type { SupabaseClient } from "@supabase/supabase-js";
import {
  earlyFirstSegmentDaySpan,
  isApproximatelyEarlyFirstSegmentOnly,
  type ProfileMembershipSnap,
} from "@/lib/membership-duration";
import {
  getPaymentAppSettings,
  membershipMonthsForTier,
  storedTierForPackageId,
  type PaymentAppSettingsRow,
} from "@/lib/payment-app-settings";

export type { ProfileMembershipSnap };
export { earlyFirstSegmentDaySpan, isApproximatelyEarlyFirstSegmentOnly };

/** membership төлбөрийн booking_id-аас эхлэл/дуусах огноо тооцох (Early хуваагдсан + legacy нэг дор) */

export type ParsedMembershipBooking =
  | { kind: "early_first" }
  | { kind: "early_rest" }
  | { kind: "annual_from_payment"; tier: string }
  | { kind: "upgrade"; tier: string };

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
    case "smart":
      return "standard";
    // Хуучин Early — DB-д early үлдээнэ
    case "gymgo":
      return "gymgo";
    case "early":
    case "early_year":
    case "early_month":
      return "early";
    default:
      return bookingTier || "standard";
  }
}

/** Хадгалагдсан tier бүрийн албан ёсны үнэ (зөрүү тооцоонд). */
export function priceForStoredTier(
  settings: Pick<
    PaymentAppSettingsRow,
    | "standard3_price_mnt"
    | "smart1_price_mnt"
    | "premium_membership_price_mnt"
    | "premium4_price_mnt"
    | "early_membership_price_mnt"
  >,
  storedTier: string,
): number {
  switch (storedTier) {
    case "standard":
      return settings.standard3_price_mnt;
    case "premium1":
      return settings.smart1_price_mnt;
    case "premium2":
      return settings.premium_membership_price_mnt;
    case "gymcore":
      return settings.premium4_price_mnt;
    case "early":
      return settings.early_membership_price_mnt;
    case "gymgo":
      return 300_000;
    default:
      return 0;
  }
}

/** Багцын id-аар албан ёсны үнэ (Smart промо код дотор 300k). */
export function priceForPackageId(
  settings: Pick<
    PaymentAppSettingsRow,
    | "standard3_price_mnt"
    | "smart1_price_mnt"
    | "premium_membership_price_mnt"
    | "premium4_price_mnt"
    | "early_membership_price_mnt"
  >,
  packageId: string,
): number {
  switch ((packageId || "").toLowerCase()) {
    case "smart":
    case "gymgo":
      return 300_000;
    case "smart1":
    case "premium1":
    case "plus":
      return settings.smart1_price_mnt;
    case "standard3":
    case "standard":
    case "basic":
      return settings.standard3_price_mnt;
    case "premium":
    case "premium2":
      return settings.premium_membership_price_mnt;
    case "premium4":
    case "gymcore":
    case "prime":
      return settings.premium4_price_mnt;
    case "early":
      return settings.early_membership_price_mnt;
    default:
      return 0;
  }
}

export function parseMembershipBookingId(bookingId: string): ParsedMembershipBooking | null {
  if (!bookingId.startsWith("membership-")) return null;
  const parts = bookingId.split("-");
  // membership-upgrade-<tier>-<ts> — багц ахиулах (зөрүү төлбөр, эрх солигдоно)
  if (parts[1] === "upgrade") {
    return { kind: "upgrade", tier: parts[2] || "" };
  }
  // Хуучин эхний сар / үлдэгдэл (шинэ 150k зарахгүй; үлдэгдэл төлбөр үлдэнэ)
  if (parts.length >= 4 && parts[1] === "early" && parts[2] === "first") {
    return { kind: "early_first" };
  }
  if (parts.length >= 4 && parts[1] === "early" && parts[2] === "rest") {
    return { kind: "early_rest" };
  }
  // Legacy full-year Early (membership-early-<ts>) → шинэ Standard 6 сар
  if (parts.length === 3 && parts[1] === "early" && /^\d+$/.test(parts[2] ?? "")) {
    return { kind: "annual_from_payment", tier: "standard3" };
  }
  const tier = parts[1];
  if (tier === "early") {
    return { kind: "annual_from_payment", tier: "standard3" };
  }
  if (tier === "premium") {
    return { kind: "annual_from_payment", tier };
  }
  return { kind: "annual_from_payment", tier: tier || "standard3" };
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

/** Багц бүрийн 7 хоногийн зочлох эрхийн лимит. NULL = лимитгүй (хуучин дүрэм: өдөрт 1 удаа). */
export function weeklyVisitLimitForTier(storedTier: string): number | null {
  switch (storedTier) {
    case "standard":
      return 3;
    case "premium1":
    case "premium2":
      return 4;
    case "gymgo":
      return 3;
    default:
      return null;
  }
}

/**
 * Төлбөр баталгаажсаны дараах profiles шинэчлэлт.
 * early_rest: дуусах = анхны эхний сар эхэлсэн огноос +1 жил.
 * annual_from_payment: админ тохируулсан багцын сараар нэмнэ.
 */
export function computeMembershipDatesAfterPayment(args: {
  bookingId: string;
  now: Date;
  profile: ProfileMembershipSnap;
  /** Багцын үндсэн эрх — сар. Өгөөгүй бол хуучин default (Standard 6 / бусад 12). */
  monthsByTier?: Pick<
    PaymentAppSettingsRow,
    | "packages"
    | "smart1_months"
    | "standard3_months"
    | "premium_months"
    | "premium4_months"
  >;
}): {
  membership_tier: string;
  membership_status: "active";
  membership_started_at: string;
  membership_expires_at: string;
  weekly_visit_limit: number | null;
  membership_package_id: string;
} | null {
  const parsed = parseMembershipBookingId(args.bookingId);
  if (!parsed) return null;

  const { now, profile } = args;
  const monthsCfg = args.monthsByTier ?? {
    packages: [],
    smart1_months: 12,
    standard3_months: 6,
    premium_months: 12,
    premium4_months: 12,
  };

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
      weekly_visit_limit: null,
      membership_package_id: "early",
    };
  }

  if (parsed.kind === "upgrade") {
    const isActive = String(profile.membership_status ?? "").toLowerCase() === "active";
    const hasFutureExpiry =
      !!profile.membership_expires_at && new Date(profile.membership_expires_at) > now;
    // Зөвхөн идэвхтэй, хугацаа дуусаагүй гишүүн ахиулж болно. Эс бөгөөс идэвхжүүлэхгүй (аюулгүй).
    if (!isActive || !hasFutureExpiry) return null;
    const storedTier = canonicalStoredTier(parsed.tier);
    return {
      membership_tier: storedTier,
      membership_status: "active",
      // Дуусах огноо ба эхэлсэн огноо ХЭВЭЭР — зөвхөн tier дээшилнэ.
      membership_started_at: profile.membership_started_at ?? now.toISOString(),
      membership_expires_at: profile.membership_expires_at!,
      weekly_visit_limit: weeklyVisitLimitForTier(storedTier),
      membership_package_id: parsed.tier,
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
      weekly_visit_limit: null,
      membership_package_id: "early",
    };
  }

  let baseDate = now;
  if (profile.membership_expires_at) {
    const currentExpiry = new Date(profile.membership_expires_at);
    if (currentExpiry > now && profile.membership_status === "active") {
      // Client+server race: web/app аль хэдийн нэмсэн бол дахин stack хийхгүй.
      const startedMs = profile.membership_started_at
        ? new Date(profile.membership_started_at).getTime()
        : NaN;
      const isStandard =
        parsed.tier === "standard3" || parsed.tier === "standard" || parsed.tier === "early";
      const recentStart =
        Number.isFinite(startedMs) && Math.abs(now.getTime() - startedMs) < 15 * 60 * 1000;
      if (!(isStandard && recentStart)) {
        baseDate = currentExpiry;
      }
    }
  }

  const months = membershipMonthsForTier(parsed.tier, monthsCfg);
  const expiresAt = addCalendarMonths(baseDate, months);

  const storedTier = storedTierForPackageId(parsed.tier, monthsCfg);
  return {
    membership_tier: storedTier,
    membership_status: "active",
    membership_started_at: now.toISOString(),
    membership_expires_at: expiresAt.toISOString(),
    weekly_visit_limit: weeklyVisitLimitForTier(storedTier),
    membership_package_id: parsed.tier,
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
  // ON CONFLICT DO NOTHING — no 23505 in Postgres logs on retries.
  const { data, error } = await supabase
    .from("membership_activations")
    .upsert(
      { booking_id: bookingId, user_id: userId },
      { onConflict: "booking_id", ignoreDuplicates: true },
    )
    .select("booking_id");

  if (!error) {
    return data && data.length > 0 ? "claimed" : "already";
  }

  if (error.code === "23505") return "already"; // legacy / race fallback
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
  params: { userId: string; bookingId: string; actorId?: string | null },
): Promise<boolean> {
  const { userId, bookingId, actorId } = params;
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
    .select("membership_started_at, membership_expires_at, membership_status, membership_tier")
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

  const settings = await getPaymentAppSettings();
  const update = computeMembershipDatesAfterPayment({
    bookingId,
    now,
    profile: snap,
    monthsByTier: settings,
  });
  if (!update) {
    if (claim === "claimed") await releaseMembershipBooking(supabase, bookingId);
    return false;
  }

  // Ахиулах booking — зөрүү төлбөрийг server дээр баталгаажуулна (клиентэд итгэхгүй).
  const parsedForCheck = parseMembershipBookingId(bookingId);
  if (parsedForCheck?.kind === "upgrade") {
    const currentPkgId = String(
      (profile as { membership_package_id?: string | null } | null)?.membership_package_id ?? "",
    );
    const currentTier = String(
      (profile as { membership_tier?: string | null } | null)?.membership_tier ?? "",
    );
    const currentPrice = currentPkgId
      ? priceForPackageId(settings, currentPkgId)
      : priceForStoredTier(settings, currentTier);
    const expectedDiff = priceForPackageId(settings, parsedForCheck.tier) - currentPrice;
    if (expectedDiff > 0) {
      const { data: bk } = await supabase
        .from("bookings")
        .select("amount")
        .eq("id", bookingId)
        .maybeSingle();
      const paid = Number((bk as { amount?: number } | null)?.amount ?? 0);
      // 2000₮ хүлцэл (бөөрөнхийлөлт/шимтгэл).
      if (paid + 2000 < expectedDiff) {
        console.warn("[membership-from-booking] upgrade underpaid", { bookingId, paid, expectedDiff });
        if (claim === "claimed") await releaseMembershipBooking(supabase, bookingId);
        return false;
      }
    }
  }

  const { error: upErr } = await supabase.from("profiles").update(update).eq("id", userId);
  if (upErr) {
    console.error("[membership-from-booking] profile update:", upErr.message);
    if (claim === "claimed") await releaseMembershipBooking(supabase, bookingId);
    return false;
  }

  // Audit: booking + payment channel (+ админ гараар тэмдэглэсэн бол actor)
  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("payment_channel")
      .eq("id", bookingId)
      .maybeSingle();

    const { attributeMembershipAudit } = await import("@/lib/membership-audit");
    await attributeMembershipAudit(supabase, userId, {
      actorId: actorId ?? null,
      source: actorId ? "admin" : "payment",
      bookingId,
      paymentChannel: booking?.payment_channel ?? null,
    });
  } catch (e) {
    console.warn(
      "[membership-from-booking] audit enrich failed:",
      e instanceof Error ? e.message : e,
    );
  }

  // Fire-and-forget push — never block payment activation on FCM failures.
  void (async () => {
    try {
      const { isFcmConfigured, sendPushToUserId } = await import("@/lib/fcm");
      if (!isFcmConfigured()) return;
      await sendPushToUserId(supabase, userId, {
        title: "Гишүүнчлэл идэвхжлээ",
        body: "Төлбөр амжилттай. Таны гишүүнчлэл шинэчлэгдлээ.",
        data: { type: "membership_activated", booking_id: bookingId },
      });
    } catch (e) {
      console.warn(
        "[membership-from-booking] push failed:",
        e instanceof Error ? e.message : e,
      );
    }
  })();

  return true;
}
