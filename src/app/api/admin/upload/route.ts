import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";

export async function POST(request: Request) {
  const auth = await verifyBearerUser(request);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.permissions, "users.manage")) {
    return NextResponse.json({ error: "Файл оруулах эрхгүй." }, { status: 403 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 }
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  );

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const bucket = (formData.get("bucket") as string) || "media-public";
  const path = formData.get("path") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop();
  const uploadPath = path || `uploads/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: upErr } = await admin.storage
    .from(bucket)
    .upload(uploadPath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(uploadPath);

  return NextResponse.json({ url: data.publicUrl });
}
