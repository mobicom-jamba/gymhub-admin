import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/verify-org-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/context — HR портал ачаалахад: нэвтэрсэн хүний байгууллага(ууд).
 * gym owner порталын /api/admin/gym-staff-тэй ижил үүрэгтэй.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrgAccess(request, searchParams.get("org_id"));
    if (!access.ok) return access.response;

    return NextResponse.json({ org: access.org, orgs: access.orgs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
