import { earlyFirstSegmentDaySpan, isApproximatelyEarlyFirstSegmentOnly } from "@/lib/membership-from-booking";

export type MembershipPlanVariant = "premium_year" | "early_year" | "early_month" | "neutral";

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

/**
 * Гишүүнчлэлийн төрлийг хугацаанаас нь ялгана:
 * - Premium → үргэлж 1 жилийн багц
 * - Early + ~20–45 өдөр → эхний сарын төлбөр (1 сар)
 * - Early + урт хугацаа → 1 жил (эсвэл үлдэгдэл + нэг дор төлөгдсөн)
 */
export function getMembershipPlanVisual(profile: ProfileLike): MembershipPlanVisual {
  const tier = (profile.membership_tier ?? "").trim().toLowerCase();

  if (tier === "premium") {
    return {
      title: "Premium — 1 жилийн гишүүнчлэл (жилийн багц)",
      shortLabel: "Premium · 1 жил",
      variant: "premium_year",
    };
  }

  if (tier === "early") {
    const snap = {
      membership_started_at: profile.membership_started_at,
      membership_expires_at: profile.membership_expires_at,
      membership_status: null as string | null,
    };

    if (
      profile.membership_started_at &&
      profile.membership_expires_at &&
      isApproximatelyEarlyFirstSegmentOnly(snap)
    ) {
      return {
        title: "Early — эхний сарын төлбөр (ойролцоо 1 сарын хугацаа)",
        shortLabel: "Early · 1 сар",
        variant: "early_month",
      };
    }

    const days = earlyFirstSegmentDaySpan(snap);
    if (days != null && days >= 280) {
      const approxYears = Math.round(days / 365);
      if (approxYears <= 1) {
        return {
          title: "Early — 1 жилийн гишүүнчлэл (бүтэн жил эсвэл хуучин нэг дорх багц)",
          shortLabel: "Early · 1 жил",
          variant: "early_year",
        };
      }

      return {
        title: `Early — урт хугацааны гишүүнчлэл (~${approxYears} жил)`,
        shortLabel: `Early · ~${approxYears} жил`,
        variant: "early_year",
      };
    }

    if (days != null && days >= 46) {
      const approxMonths = Math.max(2, Math.round(days / 30));
      return {
        title: `Early — олон сарын идэвхтэй хугацаа (~${approxMonths} сар)`,
        shortLabel: `Early · ~${approxMonths} сар`,
        variant: "early_year",
      };
    }

    return {
      title: "Early — тариф (огноо дутуу эсвэл товч хугацаа)",
      shortLabel: "Early",
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
    case "premium_year":
      return "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400";
    case "early_year":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
    case "early_month":
      return "bg-teal-50 text-teal-800 dark:bg-teal-900/25 dark:text-teal-300";
    default:
      return "bg-gray-50 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400";
  }
}
