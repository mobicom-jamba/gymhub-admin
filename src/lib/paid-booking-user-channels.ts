import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export type PaidBookingUserChannel = {
  user_id: string;
  payment_channel: string | null;
  qpay_invoice_id: string | null;
};

const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: PaidBookingUserChannel[] } | null = null;

/** Distinct paid users × channel via RPC — never downloads every booking row. */
export async function fetchPaidBookingUserChannels(): Promise<PaidBookingUserChannel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("paid_booking_user_channels");
  if (error) throw new Error(error.message);

  const rows: PaidBookingUserChannel[] = [];
  for (const row of data ?? []) {
    const userId = String((row as { user_id?: string }).user_id ?? "").trim();
    if (!userId) continue;
    rows.push({
      user_id: userId,
      payment_channel: ((row as { payment_channel?: string | null }).payment_channel ?? null) || null,
      qpay_invoice_id: ((row as { qpay_invoice_id?: string | null }).qpay_invoice_id ?? null) || null,
    });
  }
  cache = { at: Date.now(), rows };
  return rows;
}
