import type { SupabaseClient } from "@supabase/supabase-js";
import { safeUpdateBookingById } from "@/app/api/payment/_lib/bookings";
import { attributeMembershipAudit } from "@/lib/membership-audit";

/** Admin гараар идэвхжүүлсэн / бэлэглэсэн гишүүнчлэл — gift booking + audit. */
export async function recordGiftMembershipGrant(
  supabase: SupabaseClient,
  opts: {
    profileId: string;
    actorId: string;
    /** Зөвхөн шинээр active болсон үед gift booking үүсгэнэ */
    createBooking?: boolean;
  },
): Promise<string | null> {
  let bookingId: string | null = null;

  if (opts.createBooking !== false) {
    bookingId = `membership-gift-${Date.now()}`;
    const err = await safeUpdateBookingById(supabase, bookingId, {
      user_id: opts.profileId,
      payment_status: "paid",
      payment_channel: "gift",
      paid_at: new Date().toISOString(),
      amount: 0,
    });
    if (err) {
      console.warn("[gift-membership] booking upsert failed:", err);
      bookingId = null;
    }
  }

  await attributeMembershipAudit(supabase, opts.profileId, {
    actorId: opts.actorId,
    source: "admin",
    bookingId,
    paymentChannel: "gift",
  });

  return bookingId;
}
