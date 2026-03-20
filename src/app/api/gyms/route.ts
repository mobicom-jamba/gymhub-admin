import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/gyms — public list of active gyms for the mobile app */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("gyms")
      .select("id, name, description, address, lat, lng, image_url, opening_hours, amenities, is_active, created_at")
      .eq("is_active", true)
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ gyms: data ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
