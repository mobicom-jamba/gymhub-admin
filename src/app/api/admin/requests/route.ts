import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/admin/requests?gym_id=xxx&status=pending&date=today
 * List gym visit requests (for gym owners or admin)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gym_id");
    const status = searchParams.get("status"); // pending, approved, rejected
    const date = searchParams.get("date"); // today, week, all

    const supabase = createAdminClient();

    let query = supabase
      .from("gym_visits")
      .select("id, user_id, gym_id, gym_name, status, method, checked_in_at, reviewed_at, reviewed_by")
      .order("checked_in_at", { ascending: false })
      .limit(100);

    if (gymId) {
      query = query.eq("gym_id", gymId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (date === "today") {
      const todayStart = getTodayStartUTC8();
      query = query.gte("checked_in_at", todayStart);
    } else if (date === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("checked_in_at", weekAgo);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with user profile info
    const userIds = [...new Set((data ?? []).map((v) => v.user_id))];
    let profiles: Record<string, { full_name?: string; phone?: string }> = {};
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);
      if (profileData) {
        profiles = Object.fromEntries(profileData.map((p) => [p.id, p]));
      }
    }

    const enriched = (data ?? []).map((v) => ({
      ...v,
      user_name: profiles[v.user_id]?.full_name || null,
      user_phone: profiles[v.user_id]?.phone || null,
    }));

    return NextResponse.json({ requests: enriched });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/requests — approve or reject a visit request
 * Body: { visit_id, action: "approve" | "reject", reviewed_by? }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { visit_id, action, reviewed_by } = body as {
      visit_id: string;
      action: "approve" | "reject";
      reviewed_by?: string;
    };

    if (!visit_id || !action) {
      return NextResponse.json({ error: "visit_id, action шаардлагатай" }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action нь 'approve' эсвэл 'reject' байх ёстой" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const newStatus = action === "approve" ? "approved" : "rejected";
    const { data, error } = await supabase
      .from("gym_visits")
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewed_by || null,
      })
      .eq("id", visit_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visit: data,
      message: action === "approve" ? "Хүсэлт зөвшөөрөгдлөө" : "Хүсэлт татгалзлаа",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function getTodayStartUTC8(): string {
  const now = new Date();
  const mongoliaOffset = 8 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const mongoliaMs = utcMs + mongoliaOffset * 60000;
  const mongoliaDate = new Date(mongoliaMs);
  const startOfDay = new Date(
    mongoliaDate.getFullYear(),
    mongoliaDate.getMonth(),
    mongoliaDate.getDate(),
    0, 0, 0, 0
  );
  const startUtcMs = startOfDay.getTime() - mongoliaOffset * 60000;
  return new Date(startUtcMs).toISOString();
}
