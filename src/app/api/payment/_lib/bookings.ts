const missingColumnRegex = /Could not find the '([^']+)' column/i;

/** Columns that may be absent on older deployments — strip and retry. */
const OPTIONAL_PAYMENT_COLUMNS = new Set([
  "amount",
  "payment_status",
  "payment_channel",
  "paid_at",
  "qpay_invoice_id",
  "membership_applied_at",
]);

/**
 * Update a booking by id. For membership-* ids, upserts when no row exists yet
 * (requires `user_id` in the patch for insert).
 */
export async function safeUpdateBookingById(
  supabase: any,
  bookingId: string,
  patch: Record<string, unknown>,
): Promise<string | null> {
  let currentPatch: Record<string, unknown> = { ...patch };
  let lastError: string | null = null;

  for (let i = 0; i < 8; i++) {
    if (Object.keys(currentPatch).length === 0) {
      return null;
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(currentPatch)
      .eq("id", bookingId)
      .select("id");

    if (!error) {
      if (Array.isArray(data) && data.length > 0) return null;

      // No row updated — insert membership payment row when we have user_id.
      const userId =
        typeof currentPatch.user_id === "string"
          ? currentPatch.user_id
          : typeof patch.user_id === "string"
            ? patch.user_id
            : null;

      if (!userId || !bookingId.startsWith("membership-")) {
        return null;
      }

      const insertRow: Record<string, unknown> = {
        id: bookingId,
        user_id: userId,
        schedule_id: null,
        ...currentPatch,
      };

      const { error: insertError } = await supabase.from("bookings").insert(insertRow);
      if (!insertError) return null;

      // Race: another request inserted first — retry update once.
      if (insertError.code === "23505") {
        const { error: retryErr } = await supabase
          .from("bookings")
          .update(currentPatch)
          .eq("id", bookingId);
        if (!retryErr) return null;
        return retryErr.message ?? "Booking upsert race failed";
      }

      const insertMsg = insertError.message ?? "Unknown bookings insert error";
      const match = insertMsg.match(missingColumnRegex);
      if (match && OPTIONAL_PAYMENT_COLUMNS.has(match[1])) {
        delete currentPatch[match[1]];
        lastError = insertMsg;
        continue;
      }
      return insertMsg;
    }

    const currentError = error.message ?? "Unknown bookings update error";
    lastError = currentError;
    const match = currentError.match(missingColumnRegex);
    if (!match) return lastError;

    const missingColumn = match[1];
    if (!(missingColumn in currentPatch)) return lastError;
    delete currentPatch[missingColumn];
  }

  return lastError;
}

export async function safeFindBookingIdByInvoice(
  supabase: any,
  invoiceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("qpay_invoice_id", invoiceId)
    .maybeSingle();

  if (!error) return (data?.id as string | undefined) ?? null;

  const msg = error.message ?? "";
  const match = msg.match(missingColumnRegex);
  if (match && match[1] === "qpay_invoice_id") {
    return null;
  }

  return null;
}
