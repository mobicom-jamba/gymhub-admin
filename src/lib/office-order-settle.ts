import type { SupabaseClient } from "@supabase/supabase-js";

/** «office-» угтвартай booking нь оффис багцын захиалга. */
export function isOfficeBookingId(bookingId: string | null | undefined): boolean {
  return Boolean(bookingId && bookingId.startsWith("office-"));
}

/**
 * Оффис багцын захиалгыг төлөгдсөн болгоно.
 *
 * QPay-ээс ирсэн бодит дүнг багцын үнэтэй тулгана: дутуу орсон бол `underpaid`
 * гэж тэмдэглээд админд үлдээнэ — «Төлсөн» гэж харуулчихвал байгууллагад
 * дутуу төлбөрөөр эрх олгох эрсдэлтэй. Давхар дуудагдсан ч нэг л удаа бичнэ.
 */
export async function markOfficeOrderPaid(
  supabase: SupabaseClient,
  bookingId: string,
  options: { invoiceId?: string | null; paidAmount?: number | null } = {},
): Promise<boolean> {
  const { data: row, error: selectError } = await supabase
    .from("office_package_requests")
    .select("id, price_mnt, status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (selectError) {
    console.warn("[office-order-settle] select:", selectError.message);
    return false;
  }
  if (!row) return false;

  const current = row as { id: string; price_mnt: number | null; status: string };
  if (current.status === "paid") return false;

  const paidAmount =
    typeof options.paidAmount === "number" && options.paidAmount > 0 ? options.paidAmount : null;
  const price = current.price_mnt ?? 0;
  const underpaid = paidAmount !== null && price > 0 && paidAmount < price;

  const { error } = await supabase
    .from("office_package_requests")
    .update({
      status: underpaid ? "underpaid" : "paid",
      paid_at: new Date().toISOString(),
      paid_amount: paidAmount,
      ...(options.invoiceId ? { qpay_invoice_id: String(options.invoiceId) } : {}),
    })
    .eq("id", current.id);

  if (error) {
    console.warn("[office-order-settle] update:", error.message);
    return false;
  }
  return !underpaid;
}
