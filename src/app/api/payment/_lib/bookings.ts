const missingColumnRegex = /Could not find the '([^']+)' column/i;

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

    const { error } = await supabase
      .from("bookings")
      .update(currentPatch)
      .eq("id", bookingId);

    if (!error) return null;

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
