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
      "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
    },
  });
}

/** Sales UI: үлдэгдэл 1–2 болбол 9 болгож харуулна. */
function withDisplayFloor(payload: {
  limit: number;
  claimed: number;
  remaining: number;
  sold_out: boolean;
  [key: string]: unknown;
}) {
  if (payload.remaining <= 0 || payload.remaining > 2) return payload;
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

    // Paid membership bookings since campaign start (unique users).
    // Seed covers spots sold before tracking; new payers after START reduce remaining further.
    const { data, error } = await supabase
      .from("bookings")
      .select("user_id, paid_at, created_at, id")
      .eq("payment_status", "paid")
      .like("id", "membership-%")
      .not("user_id", "is", null)
      .limit(5000);

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

    const startMs = Date.parse(CAMPAIGN_START);
    const afterStart = new Set<string>();

    for (const row of data ?? []) {
      const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
      if (!uid) continue;
      const when = row.paid_at || row.created_at;
      const t = when ? Date.parse(String(when)) : NaN;
      if (!Number.isFinite(t) || t < startMs) continue;
      afterStart.add(uid);
    }

    const claimed = Math.min(LIMIT, SEED_CLAIMED + afterStart.size);
    const remaining = Math.max(0, LIMIT - claimed);

    return json(
      withDisplayFloor({
        limit: LIMIT,
        claimed,
        remaining,
        sold_out: remaining === 0,
        campaign_start: CAMPAIGN_START,
        new_paid_since_start: afterStart.size,
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
