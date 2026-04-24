import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

function requiredParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * GET /api/bookings/paid?start=...&end=...
 * Returns paid bookings in [start, end) by `paid_at`.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = requiredParam(url, "start");
    const end = requiredParam(url, "end");

    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing/invalid query params. Use ?start=ISO&end=ISO" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("bookings")
      .select("id,user_id,paid_at,created_at")
      .eq("payment_status", "paid")
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("paid_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

