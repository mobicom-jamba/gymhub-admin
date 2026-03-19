import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 }
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const body = await request.json();
  const { email, password, full_name, phone, role, membership_tier } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || "" },
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }
  if (authData.user) {
    await admin
      .from("profiles")
      .update({
        full_name: full_name || null,
        phone: phone || null,
        role: role || "user",
        membership_tier: membership_tier || null,
      })
      .eq("id", authData.user.id);
  }
  return NextResponse.json({ id: authData.user?.id });
}
