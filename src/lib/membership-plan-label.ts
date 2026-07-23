import { earlyFirstSegmentDaySpan, isApproximatelyEarlyFirstSegmentOnly } from "@/lib/membership-duration";

export type MembershipPlanVariant =
  | "premium1"
  | "premium2"
  | "gymcore"
  | "early_year"
  | "early_month"
  | "early_rest_due"
  | "standard_year"
  | "standard_month"
  | "unpaid"
  | "neutral";

export type MembershipPlanVisual = {
  /** Урт тайлбар — жагсаалт дээр title / tooltip */
  title: string;
  /** Богино шошгоны текст */
  shortLabel: string;
  variant: MembershipPlanVariant;
};

type ProfileLike = {
  membership_tier: string | null;
  membership_started_at: string | null;
  membership_expires_at: string | null;
  /** Байвал төлөөгүй үед багцын нэр харуулахгүй */
  membership_status?: string | null;
};

function durationSnap(profile: ProfileLike) {
  return {
    membership_started_at: profile.membership_started_at,
    membership_expires_at: profile.membership_expires_at,
    membership_status: null as string | null,
  };
}

/** Төлбөр төлөөгүй / идэвхгүй */
export function isUnpaidMembership(status: string | null | undefined): boolean {
  const s = (status ?? "inactive").trim().toLowerCase();
  return s !== "active" && s !== "expired";
}

export function getMembershipPaymentBadge(status: string | null | undefined): {
  label: string;
  className: string;
} {
  const s = (status ?? "inactive").trim().toLowerCase();
  if (s === "active") {
    return {
      label: "Төлсөн",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300",
    };
  }
  if (s === "expired") {
    return {
      label: "Дууссан",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
    };
  }
  return {
    label: "Төлөөгүй",
    className:
      "bg-rose-50 text-rose-500 ring-1 ring-rose-100 dark:bg-rose-950/20 dark:text-rose-400/80 dark:ring-rose-900/30",
  };
}

/** Booking / DB slug → canonical key (legacy early ≠ шинэ standard) */
export function canonicalPlanKey(tier: string | null | undefined): string {
  const t = (tier ?? "").trim().toLowerCase();
  if (!t) return "";
  if (t === "smart1" || t === "premium1" || t === "plus") return "premium1";
  if (t === "smart2" || t === "premium2") return "premium2";
  // Legacy `premium` booking = Smart-2 / йог багц → Premium 2
  if (t === "premium") return "premium2";
  if (t === "premium4" || t === "gymcore" || t === "prime") return "gymcore";
  // Хуучин Early багц — нэршлийг Early-ээр үлдээнэ
  if (t === "early" || t === "early_year" || t === "early_month") return "early";
  // Шинэ Standard багц
  if (t === "standard3" || t === "standard" || t === "basic") return "standard";
  return t;
}

/**
 * Гишүүнчлэлийн төрлийг нэршил + хугацаагаар ялгана.
 * Төлөөгүй (inactive) үед багцын нэр биш "Төлөөгүй" буцаана.
 */
export function getMembershipPlanVisual(profile: ProfileLike): MembershipPlanVisual {
  const status = profile.membership_status;
  if (status !== undefined && isUnpaidMembership(status)) {
    return {
      title: "Төлбөр төлөөгүй — багц идэвхжээгүй",
      shortLabel: "Төлөөгүй",
      variant: "unpaid",
    };
  }

  const tier = (profile.membership_tier ?? "").trim().toLowerCase();
  const key = canonicalPlanKey(tier);
  const snap = durationSnap(profile);
  const days = earlyFirstSegmentDaySpan(snap);

  if (key === "premium1") {
    return {
      title: "Premium 1 — фитнес 1 жил + усан бассейн 3 сар",
      shortLabel: "Premium 1 · 1 жил",
      variant: "premium1",
    };
  }

  if (key === "premium2") {
    return {
      title: "Premium 2 — фитнес 1 жил + йог 3 сар",
      shortLabel: "Premium 2 · 1 жил",
      variant: "premium2",
    };
  }

  if (key === "gymcore") {
    return {
      title: "GymCore — фитнес + бассейн + йог",
      shortLabel: "GymCore · 1 жил",
      variant: "gymcore",
    };
  }

  // ── Хуучин Early — хуучнаар нь харуулна ───────────────────────────────
  if (key === "early") {
    if (
      tier === "early" &&
      profile.membership_started_at &&
      profile.membership_expires_at &&
      isApproximatelyEarlyFirstSegmentOnly(snap)
    ) {
      return {
        title: "Early — эхний сар төлсөн, үлдсэн 11 сарын төлбөр төлөх шаардлагатай",
        shortLabel: "Early · 1 сар",
        variant: "early_rest_due",
      };
    }

    if (days != null && days >= 280) {
      return {
        title: "Early — 1 жилийн гишүүнчлэл (legacy 480k)",
        shortLabel: "Early",
        variant: "early_year",
      };
    }

    if (days != null && days >= 150 && days < 280) {
      const approxMonths = Math.max(2, Math.round(days / 30));
      return {
        title: `Early — ${approxMonths} сарын эрх`,
        shortLabel: approxMonths === 6 ? "Early · 6 сар" : `Early · ~${approxMonths} сар`,
        variant: "early_year",
      };
    }

    if (days != null && days >= 20 && days <= 45) {
      return {
        title: "Early — эхний сарын төлбөр",
        shortLabel: "Early · 1 сар",
        variant: "early_month",
      };
    }

    if (days != null && days >= 46) {
      const approxMonths = Math.max(2, Math.round(days / 30));
      return {
        title: `Early — ~${approxMonths} сарын идэвхтэй хугацаа`,
        shortLabel: `Early · ~${approxMonths} сар`,
        variant: "early_year",
      };
    }

    return {
      title: "Early — хуучин Early багц",
      shortLabel: "Early",
      variant: "early_year",
    };
  }

  // ── Шинэ Standard ─────────────────────────────────────────────────────
  if (key === "standard") {
    if (days != null && days >= 280) {
      const approxYears = Math.round(days / 365);
      if (approxYears <= 1) {
        return {
          title: "Standard — 1 жилийн гишүүнчлэл",
          shortLabel: "Standard · 1 жил",
          variant: "standard_year",
        };
      }
      return {
        title: `Standard — урт хугацааны гишүүнчлэл (~${approxYears} жил)`,
        shortLabel: `Standard · ~${approxYears} жил`,
        variant: "standard_year",
      };
    }

    // Standard / standard3 ≈ 6 сар
    if (days != null && days >= 150 && days < 280) {
      const approxMonths = Math.max(2, Math.round(days / 30));
      return {
        title: `Standard — ${approxMonths} сарын фитнес эрх`,
        shortLabel: approxMonths === 6 ? "Standard · 6 сар" : `Standard · ~${approxMonths} сар`,
        variant: "standard_year",
      };
    }

    if (days != null && days >= 46) {
      const approxMonths = Math.max(2, Math.round(days / 30));
      return {
        title: `Standard — олон сарын идэвхтэй хугацаа (~${approxMonths} сар)`,
        shortLabel: `Standard · ~${approxMonths} сар`,
        variant: "standard_year",
      };
    }

    if (days != null && days >= 20 && days <= 45) {
      return {
        title: "Standard — богино хугацааны эрх",
        shortLabel: "Standard · 1 сар",
        variant: "standard_month",
      };
    }

    return {
      title: "Standard — шинэ багц",
      shortLabel: "Standard",
      variant: "neutral",
    };
  }

  if (!tier) {
    return { title: "", shortLabel: "—", variant: "neutral" };
  }

  return {
    title: `Тариф: ${tier}`,
    shortLabel: tier,
    variant: "neutral",
  };
}

export function membershipPlanBadgeClass(variant: MembershipPlanVariant): string {
  switch (variant) {
    case "premium1":
      return "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400";
    case "premium2":
      return "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-400";
    case "gymcore":
      return "bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300";
    case "early_year":
      return "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400";
    case "early_month":
    case "early_rest_due":
      return "bg-teal-50 text-teal-800 dark:bg-teal-900/25 dark:text-teal-300";
    case "standard_year":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
    case "standard_month":
      return "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/25 dark:text-indigo-300";
    case "unpaid":
      return "bg-rose-50 text-rose-500 ring-1 ring-rose-100 dark:bg-rose-950/20 dark:text-rose-400/80 dark:ring-rose-900/30";
    default:
      return "bg-gray-50 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400";
  }
}
