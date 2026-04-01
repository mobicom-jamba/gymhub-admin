import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/gyms/:id — single gym details for the client app */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing gym id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("gyms")
      .select(
        "id, name, description, address, lat, lng, image_url, opening_hours, amenities, is_active, created_at"
      )
      .eq("id", id)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    }

    return NextResponse.json({ gym: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
