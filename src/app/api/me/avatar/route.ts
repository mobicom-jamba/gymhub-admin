import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyJwtUser } from "@/lib/verify-jwt-user";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: Request) {
  const auth = await verifyJwtUser(request);
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData уншихад алдаа гарлаа." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Зураг сонгоно уу." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Зөвхөн JPEG, PNG, WebP, GIF зөвшөөрнө." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файлын хэмжээ 5MB-аас бага байх ёстой." }, { status: 400 });
  }

  const ext = extForMime(file.type);
  const objectPath = `avatars/${auth.userId}/${Date.now()}.${ext}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("media-public").upload(objectPath, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  const { data: updated, error: profErr } = await admin
    .from("profiles")
    .update({ avatar_path: objectPath, updated_at: new Date().toISOString() })
    .eq("id", auth.userId)
    .select("id")
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Профайл олдсонгүй." }, { status: 404 });
  }

  const { data: pub } = admin.storage.from("media-public").getPublicUrl(objectPath);
  return NextResponse.json({ path: objectPath, url: pub.publicUrl });
}
