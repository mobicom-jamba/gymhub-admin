/** Partner billing: per visit × amount, or flat monthly fee */
export type GymBillingMode = "per_entry" | "monthly_fixed";

export type Gym = {
  id: string;
  name?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  image_url?: string | null;
  opening_hours?: unknown;
  amenities?: string[] | null;
  is_active?: boolean | null;
  /** Max check-ins per local day (UTC+8); null = unlimited */
  daily_visitor_limit?: number | null;
  /** Lower = earlier in app fitness list */
  sort_order?: number | null;
  /** null = no partner billing configured */
  billing_mode?: GymBillingMode | null;
  /** MNT: per visit (per_entry) or flat monthly (monthly_fixed) */
  billing_amount_mnt?: number | null;
  created_at?: string;
  type?: string | null;
};

export type VisitPeriod = "today" | "7d" | "month";

/** Month amount for a gym given visit count and billing settings. */
export function gymMonthAmountMnt(
  gym: Pick<Gym, "billing_mode" | "billing_amount_mnt">,
  visitCount: number,
): number | null {
  const amount = gym.billing_amount_mnt;
  if (amount == null || amount < 0 || !gym.billing_mode) return null;
  if (gym.billing_mode === "per_entry") return visitCount * amount;
  if (gym.billing_mode === "monthly_fixed") return amount;
  return null;
}

export function formatMnt(n: number): string {
  return `${n.toLocaleString("mn-MN")}₮`;
}
