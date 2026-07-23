import { earlyFirstSegmentDaySpan, isApproximatelyEarlyFirstSegmentOnly } from "@/lib/membership-from-booking";

export type MembershipPlanVariant =
  | "premium1"
  | "premium2"
  | "gymcore"
  | "standard_year"
  | "standard_month"
  | "standard_rest_due"
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
};

/** Booking / DB slug → шинэ багцын canonical key */
export function canonicalPlanKey(tier: string | null | undefined): string {
  const t = (tier ?? "").trim().toLowerCase();
  if (!t) return "";
  if (t === "smart1" || t === "premium1" || t === "plus") return "premium1";
  if (t === "smart2" || t === "premium2") return "premium2";
  // Legacy `premium` booking = Smart-2 / йог багц → Premium 2
  if (t === "premium") return "premium2";
  if (t === "premium4" || t === "gymcore" || t === "prime") return "gymcore";
  if (
    t === "standard3" ||
    t === "standard" ||
    t === "early" ||
    t === "early_year" ||
    t === "early_month" ||
    t === "basic"
  ) {
    return "standard";
  }
  return t;
}

/**
 * Гишүүнчлэлийн төрлийг шинэ нэршил + хугацаагаар ялгана:
 * - smart1 → Premium 1
 * - premium / smart2 → Premium 2
 * - early / standard3 → Standard
 * - premium4 → GymCore
 */
export function getMembershipPlanVisual(profile: ProfileLike): MembershipPlanVisual {
  const tier = (profile.membership_tier ?? "").trim().toLowerCase();
  const key = canonicalPlanKey(tier);

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

  if (key === "standard") {
    const snap = {
      membership_started_at: profile.membership_started_at,
      membership_expires_at: profile.membership_expires_at,
      membership_status: null as string | null,
    };

    // Хуучин Early эхний сарын төлбөр — үлдсэн 11 сар төлөх шаардлагатай
    if (
      tier === "early" &&
      profile.membership_started_at &&
      profile.membership_expires_at &&
      isApproximatelyEarlyFirstSegmentOnly(snap)
    ) {
      return {
        title: "Standard — эхний сар төлсөн, үлдсэн 11 сарын төлбөр төлөх шаардлагатай",
        shortLabel: "Standard · 11 сар төлөх",
        variant: "standard_rest_due",
      };
    }

    const days = earlyFirstSegmentDaySpan(snap);
    if (days != null && days >= 280) {
      const approxYears = Math.round(days / 365);
      if (approxYears <= 1) {
        return {
          title: "Standard — 1 жилийн гишүүнчлэл (бүтэн жил эсвэл хуучин Early багц)",
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

    // Standard багц-3 ≈ 6 сар
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
        title: "Standard — эхний сарын төлбөр (хуучин Early)",
        shortLabel: "Standard · 1 сар",
        variant: "standard_month",
      };
    }

    return {
      title: "Standard — тариф (огноо дутуу эсвэл товч хугацаа)",
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
    case "standard_year":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
    case "standard_month":
      return "bg-teal-50 text-teal-800 dark:bg-teal-900/25 dark:text-teal-300";
    case "standard_rest_due":
      return "bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300";
    default:
      return "bg-gray-50 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400";
  }
}
