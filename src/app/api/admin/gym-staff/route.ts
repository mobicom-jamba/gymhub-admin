import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/admin/gym-staff?user_id=xxx
 * Returns the gym linked to a gym owner user (bypasses RLS)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("gym_staff")
      .select("gym_id, role, gyms(name)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ gym_id: null, gym_name: null });
    }

    const gymName = (data as unknown as { gyms: { name: string } | null }).gyms?.name || null;

    return NextResponse.json({
      gym_id: data.gym_id,
      gym_name: gymName,
      staff_role: data.role,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
