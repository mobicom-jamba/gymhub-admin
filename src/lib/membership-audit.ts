import type { SupabaseClient } from "@supabase/supabase-js";

export type MembershipAuditAttrs = {
  actorId?: string | null;
  source?: string | null;
  bookingId?: string | null;
  paymentChannel?: string | null;
};

/** Service-role update-ийн дараа хамгийн сүүлийн audit мөрийг баяжуулна. */
export async function attributeMembershipAudit(
  supabase: SupabaseClient,
  profileId: string,
  attrsOrActorId: MembershipAuditAttrs | string,
  sourceIfActor = "admin",
): Promise<void> {
  const attrs: MembershipAuditAttrs =
    typeof attrsOrActorId === "string"
      ? { actorId: attrsOrActorId, source: sourceIfActor }
      : attrsOrActorId;

  const { error } = await supabase.rpc("attribute_latest_membership_audit", {
    p_profile_id: profileId,
    p_actor_id: attrs.actorId ?? null,
    p_source: attrs.source ?? null,
    p_booking_id: attrs.bookingId ?? null,
    p_payment_channel: attrs.paymentChannel ?? null,
  });
  if (error) {
    console.warn("[membership-audit] attribute failed:", error.message);
  }
}
