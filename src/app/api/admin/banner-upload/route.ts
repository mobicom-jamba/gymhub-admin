import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

export const runtime = "nodejs";

/** POST /api/admin/banner-upload — промо баннерын зургийг media-public bucket-д хадгална (зөвхөн админ). */
export async function POST(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Зураг файл шаардлагатай." }, { status: 400 });
    }
    // Vercel serverless нь хүсэлтийн биеийг ~4.5MB-аар хязгаарладаг тул 4MB-аас доош байлгана.
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Зураг 4MB-аас бага байх ёстой." }, { status: 400 });
    }
    const type = file.type || "";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "Зөвхөн зураг оруулна уу." }, { status: 400 });
    }

    const ext =
      (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const admin = createAdminClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from("media-public").upload(path, buf, {
      contentType: type,
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const { data } = admin.storage.from("media-public").getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl, path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
