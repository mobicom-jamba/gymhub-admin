import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireOrgAccess } from "@/lib/verify-org-access";
import { parseDateRange } from "../_lib/range";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/visits?org_id&from&to&limit&offset
 * Ажилчдын ирцийн түүх: хэн, хэзээ, аль фитнест.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrgAccess(request, searchParams.get("org_id"));
    if (!access.ok) return access.response;

    const { from, to } = parseDateRange(searchParams);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1), 1000);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("org_admin_visits", {
      p_org: access.org.id,
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ range: { from, to }, limit, offset, ...(data ?? {}) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
