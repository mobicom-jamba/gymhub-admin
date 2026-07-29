import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { canAccessAuditLog } from "@/lib/audit-log-access";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/membership-audit?q=&limit=&offset=
 * Гишүүнчлэлийн өөрчлөлтийн audit жагсаалт.
 * Зөвхөн AUDIT_LOG_ALLOWED_EMAIL хэрэглэгчид нээлттэй.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;

    if (!canAccessAuditLog(auth.email)) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

    const supabase = createAdminClient();

    let profileIds: string[] | null = null;
    if (q) {
      const like = `%${q.replace(/[%_,.()]/g, "")}%`;
      const { data: matches, error: searchErr } = await supabase
        .from("profiles")
        .select("id")
        .or(`full_name.ilike."${like}",phone.ilike."${like}",surname.ilike."${like}",given_name.ilike."${like}"`)
        .limit(200);

      if (searchErr) {
        return NextResponse.json({ error: searchErr.message }, { status: 500 });
      }
      profileIds = (matches ?? []).map((m) => m.id);
      if (profileIds.length === 0) {
        return NextResponse.json({ rows: [], total: 0, limit, offset });
      }
    }

    let query = supabase
      .from("membership_audit_logs")
      .select(
        `
        id,
        profile_id,
        changed_by,
        old_membership_tier,
        new_membership_tier,
        old_membership_status,
        new_membership_status,
        old_membership_started_at,
        new_membership_started_at,
        old_membership_expires_at,
        new_membership_expires_at,
        source,
        booking_id,
        payment_channel,
        created_at,
        profile:profiles!membership_audit_logs_profile_id_fkey(id, full_name, phone, surname, given_name),
        actor:profiles!membership_audit_logs_changed_by_fkey(id, full_name, phone, role)
      `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (profileIds) {
      query = query.in("profile_id", profileIds);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
