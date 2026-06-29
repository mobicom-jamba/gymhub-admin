/** Whether membership is expired (Дууссан) or still valid (Эрх идэвхитэй). */
export type MembershipExpiryStatus = "expired" | "active";

export function membershipExpiryStatus(
  membershipStatus: string | null | undefined,
  expiresAt: string | null | undefined,
): MembershipExpiryStatus | null {
  const status = (membershipStatus ?? "").trim().toLowerCase();
  if (status === "inactive" || status === "expired") return "expired";
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (!Number.isNaN(exp.getTime())) {
      return exp < new Date() ? "expired" : "active";
    }
  }
  if (status === "active") return "active";
  return null;
}

export function membershipExpiryStatusLabel(
  membershipStatus: string | null | undefined,
  expiresAt: string | null | undefined,
): string {
  const s = membershipExpiryStatus(membershipStatus, expiresAt);
  if (s === "expired") return "Дууссан";
  if (s === "active") return "Эрх идэвхитэй";
  return "";
}

export function membershipExpiryStatusRank(
  membershipStatus: string | null | undefined,
  expiresAt: string | null | undefined,
): number {
  const s = membershipExpiryStatus(membershipStatus, expiresAt);
  if (s === "expired") return 0;
  if (s === "active") return 1;
  return 2;
}
