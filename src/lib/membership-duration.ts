/** Pure membership duration helpers — safe for client components. */

export type ProfileMembershipSnap = {
  membership_started_at: string | null;
  membership_expires_at: string | null;
  membership_status: string | null;
};

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
