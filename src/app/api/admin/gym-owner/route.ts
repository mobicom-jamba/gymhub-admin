import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/admin/gym-owner?gym_id=xxx
 * Get the owner linked to a gym
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gym_id");
    if (!gymId) return NextResponse.json({ error: "gym_id required" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: staff } = await supabase
      .from("gym_staff")
      .select("user_id")
      .eq("gym_id", gymId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (!staff) return NextResponse.json({ owner: null });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, phone, email")
      .eq("id", staff.user_id)
      .maybeSingle();

    return NextResponse.json({
      owner: profile ? {
        user_id: profile.id,
        name: profile.full_name,
        phone: profile.phone,
        email: profile.email,
      } : null,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

/**
 * POST /api/admin/gym-owner
 * Create or update the gym owner
 * Body: { gym_id, name, phone, password }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gym_id, name, phone, password } = body as {
      gym_id: string;
      name: string;
      phone: string;
      password?: string;
    };

    if (!gym_id || !phone) {
      return NextResponse.json({ error: "gym_id, phone шаардлагатай" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const virtualEmail = `${phone.replace(/\D/g, "")}@gymhub.mn`;

    // Check if there's already an owner for this gym
    const { data: existingStaff } = await supabase
      .from("gym_staff")
      .select("user_id")
      .eq("gym_id", gym_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    let userId: string;

    if (existingStaff) {
      // Update existing owner
      userId = existingStaff.user_id;

      // Update auth user
      const updatePayload: Record<string, unknown> = {
        email: virtualEmail,
        email_confirm: true,
        phone: phone.replace(/\D/g, ""),
        phone_confirm: true,
      };
      if (password?.trim()) {
        updatePayload.password = password.trim();
      }
      const { error: authErr } = await supabase.auth.admin.updateUserById(userId, updatePayload);
      if (authErr) {
        return NextResponse.json({ error: `Auth update: ${authErr.message}` }, { status: 500 });
      }

      // Update profile
      await supabase
        .from("profiles")
        .update({ full_name: name || null, phone: phone.replace(/\D/g, ""), role: "gym_owner" })
        .eq("id", userId);

    } else {
      // Create new owner
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: virtualEmail,
        phone: phone.replace(/\D/g, ""),
        password: password || "123456",
        email_confirm: true,
        phone_confirm: true,
      });

      if (authErr) {
        // Maybe user exists with that email
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users?.find((u) => u.email === virtualEmail);
        if (existing) {
          userId = existing.id;
          if (password?.trim()) {
            await supabase.auth.admin.updateUserById(userId, { password: password.trim() });
          }
        } else {
          return NextResponse.json({ error: `Auth create: ${authErr.message}` }, { status: 500 });
        }
      } else {
        userId = authData.user.id;
      }

      // Set profile
      await supabase
        .from("profiles")
        .upsert({ id: userId, full_name: name || null, phone: phone.replace(/\D/g, ""), role: "gym_owner" }, { onConflict: "id" });

      // Link to gym
      await supabase
        .from("gym_staff")
        .upsert({ user_id: userId, gym_id, role: "owner" }, { onConflict: "user_id,gym_id" });
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
