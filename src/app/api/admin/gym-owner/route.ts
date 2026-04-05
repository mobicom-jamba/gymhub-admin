import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

async function findUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const u = data.users.find((x) => x.email?.toLowerCase() === target);
    if (u) return { id: u.id };
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

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

    let name = profile?.full_name || null;
    let phone = profile?.phone || null;
    let email = profile?.email || null;

    // Fallback to auth.users if profiles data is incomplete
    if (!name || !phone) {
      try {
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(staff.user_id);
        if (authUser) {
          if (!name) name = (authUser.user_metadata?.full_name as string) || null;
          if (!phone) phone = authUser.phone || (authUser.email?.endsWith("@gymhub.mn") ? authUser.email.replace("@gymhub.mn", "") : null) || null;
          if (!email) email = authUser.email && !authUser.email.endsWith("@gymhub.mn") ? authUser.email : null;
        }
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      owner: {
        user_id: staff.user_id,
        name,
        phone,
        email,
      },
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
    const digits = phone.replace(/\D/g, "");
    const virtualEmail = `${digits}@gymhub.mn`;
    const meta = {
      full_name: name?.trim() || null,
      phone: digits,
    };

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
      userId = existingStaff.user_id;

      // Зөвхөн имэйл + metadata + нууц үг (утасны SMS auth идэвхгүй үед phone талбар алдаа өгдөг)
      const updatePayload: Record<string, unknown> = {
        email: virtualEmail,
        email_confirm: true,
        user_metadata: meta,
      };
      if (password?.trim()) {
        updatePayload.password = password.trim();
      }
      const { error: authErr } = await supabase.auth.admin.updateUserById(userId, updatePayload);
      if (authErr) {
        return NextResponse.json({ error: `Auth update: ${authErr.message}` }, { status: 500 });
      }

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: userId,
          full_name: name?.trim() || null,
          phone: digits,
          role: "gym_owner",
        },
        { onConflict: "id" },
      );
      if (profileErr) {
        return NextResponse.json({ error: `Profile: ${profileErr.message}` }, { status: 500 });
      }
    } else {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: virtualEmail,
        password: password?.trim() || "123456",
        email_confirm: true,
        user_metadata: meta,
      });

      if (authErr) {
        const existing = await findUserByEmail(supabase, virtualEmail);
        if (existing) {
          userId = existing.id;
          const up: Record<string, unknown> = {
            email: virtualEmail,
            email_confirm: true,
            user_metadata: meta,
          };
          if (password?.trim()) up.password = password.trim();
          const { error: updErr } = await supabase.auth.admin.updateUserById(userId, up);
          if (updErr) {
            return NextResponse.json({ error: `Auth link: ${updErr.message}` }, { status: 500 });
          }
        } else {
          return NextResponse.json({ error: `Auth create: ${authErr.message}` }, { status: 500 });
        }
      } else if (!authData.user?.id) {
        return NextResponse.json({ error: "Auth create: хэрэглэгчийн id олдсонгүй" }, { status: 500 });
      } else {
        userId = authData.user.id;
      }

      const { error: profileErr } = await supabase.from("profiles").upsert(
        { id: userId, full_name: name?.trim() || null, phone: digits, role: "gym_owner" },
        { onConflict: "id" },
      );
      if (profileErr) {
        return NextResponse.json({ error: `Profile: ${profileErr.message}` }, { status: 500 });
      }

      const { error: staffErr } = await supabase
        .from("gym_staff")
        .upsert({ user_id: userId, gym_id, role: "owner" }, { onConflict: "user_id,gym_id" });
      if (staffErr) {
        return NextResponse.json({ error: `gym_staff: ${staffErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
