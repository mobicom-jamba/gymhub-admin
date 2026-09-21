import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/organizations — public list for registration (id + name only) */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const organizations = (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? "").trim() || "Нэргүй",
    }));

    return NextResponse.json(
      { organizations },
      {
        headers: {
          // Шинэ байгууллага HR-ийн сонголтод шууд гарч ирэх ёстой тул
          // хөтөч бүрд тухай бүр шалгуулна; ачааллыг зөвхөн CDN богино
          // хугацаанд авч үлдэнэ.
          "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
