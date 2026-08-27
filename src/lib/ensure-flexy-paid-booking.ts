import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Flexy төлбөр bookings хүснэгтэд мөр үүсгэхгүй байсан тул админ
 * «Төлбөрийн хэрэгсэл» / өдрийн шүүлт зөвхөн installment_* дээр тулгуурладаг.
 * Эхний (эсвэл аливаа) төлбөртэй booking_id-г paid gymfintech мөр болгон sync хийнэ.
 */
export async function ensureFlexyPaidBooking(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    userId: string;
    amount: number;
    paidAt?: string | null;
    qpayInvoiceId?: string | null;
  },
): Promise<void> {
  const bookingId = String(params.bookingId ?? "").trim();
  const userId = String(params.userId ?? "").trim();
  if (!bookingId || !userId) return;

  const paidAt = params.paidAt?.trim() || new Date().toISOString();
  const amount = Number.isFinite(params.amount) ? Math.max(0, Math.floor(params.amount)) : 0;
  const invoice = params.qpayInvoiceId?.trim() || null;

  const { data: existing, error: selErr } = await supabase
    .from("bookings")
    .select("id, payment_status, payment_channel")
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr) {
    console.warn("[ensureFlexyPaidBooking] select:", selErr.message);
    return;
  }

  if (existing) {
    const alreadyPaid = String(existing.payment_status ?? "").toLowerCase() === "paid";
    const channel = String(existing.payment_channel ?? "").trim().toLowerCase();
    // QPay callback often marks the same booking as qpay first — always force gymfintech.
    if (alreadyPaid && (channel === "gymfintech" || channel === "flexy")) return;
    const patch: Record<string, unknown> = {
      payment_status: "paid",
      payment_channel: "gymfintech",
    };
    if (!alreadyPaid) {
      patch.paid_at = paidAt;
      patch.membership_applied_at = paidAt;
      if (amount) patch.amount = amount;
    }
    if (invoice) patch.qpay_invoice_id = invoice;
    const { error } = await supabase.from("bookings").update(patch).eq("id", bookingId);
    if (error) console.warn("[ensureFlexyPaidBooking] update:", error.message);
    return;
  }

  const { error } = await supabase.from("bookings").insert({
    id: bookingId,
    user_id: userId,
    status: "booked",
    amount: amount || null,
    payment_status: "paid",
    payment_channel: "gymfintech",
    paid_at: paidAt,
    membership_applied_at: paidAt,
    qpay_invoice_id: invoice,
  });
  if (error) console.warn("[ensureFlexyPaidBooking] insert:", error.message);
}
