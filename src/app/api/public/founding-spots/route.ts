import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/public/founding-spots
 *
 * "Эхний 100 хэрэглэгч" campaign counter for the landing sales UI.
 * remaining = limit - claimed, decreases as unique users complete membership payment.
 *
 * Env (optional):
 * - FOUNDING_SPOTS_LIMIT (default 100)
 * - FOUNDING_SPOTS_SEED_CLAIMED — already-sold before live tracking (default 76 → 24 left)
 * - FOUNDING_SPOTS_START — ISO date; only payments on/after this add to seed (default 2026-08-06)
 */
const LIMIT = Math.max(
  1,
  Math.min(10_000, Number(process.env.FOUNDING_SPOTS_LIMIT ?? 100) || 100),
);
const SEED_CLAIMED = Math.max(
  0,
  Math.min(LIMIT, Number(process.env.FOUNDING_SPOTS_SEED_CLAIMED ?? 76) || 0),
);
const CAMPAIGN_START =
  process.env.FOUNDING_SPOTS_START?.trim() || "2026-08-06T00:00:00.000Z";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
}

/** Sales UI: үлдэгдэл 0–2 болбол 9 болгож харуулна. */
function withDisplayFloor(payload: {
  limit: number;
  claimed: number;
  remaining: number;
  sold_out: boolean;
  [key: string]: unknown;
}) {
  if (payload.remaining > 2) return payload;
  const remaining = 9;
  return {
    ...payload,
    remaining,
    claimed: Math.max(0, payload.limit - remaining),
    sold_out: false,
  };
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Distinct paid membership users since campaign start — one aggregate RPC,
    // not a 5000-row bookings download.
    const { data, error } = await supabase.rpc("count_founding_spot_payers", {
      p_start: CAMPAIGN_START,
    });

    if (error) {
      console.warn("[founding-spots]", error.message);
      const claimed = SEED_CLAIMED;
      return json(
        withDisplayFloor({
          limit: LIMIT,
          claimed,
          remaining: Math.max(0, LIMIT - claimed),
          sold_out: claimed >= LIMIT,
          source: "seed_fallback",
        }),
      );
    }

    const newPaid = Math.max(0, Number(data) || 0);
    const claimed = Math.min(LIMIT, SEED_CLAIMED + newPaid);
    const remaining = Math.max(0, LIMIT - claimed);

    return json(
      withDisplayFloor({
        limit: LIMIT,
        claimed,
        remaining,
        sold_out: remaining === 0,
        campaign_start: CAMPAIGN_START,
        new_paid_since_start: newPaid,
        source: "bookings",
      }),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const claimed = SEED_CLAIMED;
    return json(
      withDisplayFloor({
        limit: LIMIT,
        claimed,
        remaining: Math.max(0, LIMIT - claimed),
        sold_out: claimed >= LIMIT,
        error: msg,
        source: "error_fallback",
      }),
      200,
    );
  }
}
