import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone")?.replace(/\D/g, "");

    if (!phone || phone.length < 8) {
      return NextResponse.json({ email: null });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (!profile?.id) {
      return NextResponse.json({ email: null });
    }

    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);

    return NextResponse.json({ email: authUser?.user?.email ?? null });
  } catch {
    return NextResponse.json({ email: null });
  }
}
