import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireOrgAccess } from "@/lib/verify-org-access";
import { parseDateRange } from "../_lib/range";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/overview?org_id&from&to
 * Статистик + өдрийн ирцийн цуваа + топ фитнес + ажилчдын жагсаалт (нэг RPC).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrgAccess(request, searchParams.get("org_id"));
    if (!access.ok) return access.response;

    const { from, to } = parseDateRange(searchParams);
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("org_admin_overview", {
      p_org: access.org.id,
      p_from: from,
      p_to: to,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ org: access.org, range: { from, to }, ...(data ?? {}) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
